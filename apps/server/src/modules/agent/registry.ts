import {
  type AgentAction,
  AppError,
  ConflictError,
  decideApproval,
  type IdFactory,
  issuesFromZod,
  NotFoundError,
  type ToolInfo,
  type ToolPermission,
  type ToolRisk,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import type { ActionRow, ActionsRepository } from './actions-repository';
import { type Approvals, createApprovals } from './approvals';
import type { SnapshotStore } from './snapshots';
import type { Actor, AgentServices, AnyTool, Json, UndoContext } from './types';

/**
 * The tool registry (tasks 12.02–12.04, agent-system.md §§6–8): the one way a model — or an MCP
 * client — acts on the knowledge base. A call is validated, put through the permission policy
 * (reads run; writes run, are logged and can be undone; destructive calls and bulk writes need an
 * approval token bound to their arguments), executed, its output validated, and logged with what is
 * needed to undo it. Refusals and failures come back as results the model can read, never as silence.
 */

export type ToolOutcome =
  | {
      status: 'ok';
      tool: string;
      risk: ToolRisk;
      output: unknown;
      summary: string;
      /** The log entry, for calls that change something. */
      actionId: string | null;
    }
  | {
      status: 'approval_required';
      tool: string;
      risk: ToolRisk;
      summary: string;
      reason: string;
      /** The arguments as they will run, checked and completed, for the approval card. */
      input: unknown;
    }
  | { status: 'denied'; tool: string; risk: ToolRisk; reason: string; actionId: string | null }
  | { status: 'error'; tool: string; message: string; actionId: string | null };

export interface CallOptions {
  actor: Actor;
  /** A token from `grant` for exactly this tool and these arguments. */
  approval?: string | undefined;
  signal?: AbortSignal | undefined;
  threadId?: string | undefined;
  messageId?: string | undefined;
}

export interface ToolRegistryDependencies {
  tools: readonly AnyTool[];
  services: AgentServices;
  actions: ActionsRepository;
  snapshots: SnapshotStore;
  /** The person's overrides per tool (Settings). */
  permissions: () => Readonly<Record<string, ToolPermission>>;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
  approvals?: Approvals;
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;

const SUMMARY_LIMIT = 300;
const clip = (text: string) =>
  text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT - 1)}…` : text;

/** MCP clients cannot be asked for approval, so destructive tools are not offered to them at all. */
export const offeredToMcp = (tool: AnyTool) => tool.risk !== 'destructive' && tool.mcp !== false;

export function createToolRegistry(deps: ToolRegistryDependencies) {
  const { actions, snapshots, services, clock, ids, logger } = deps;
  const approvals = deps.approvals ?? createApprovals();
  const byName = new Map<string, AnyTool>();
  for (const tool of deps.tools) {
    if (byName.has(tool.name)) throw new Error(`The tool "${tool.name}" is registered twice.`);
    byName.set(tool.name, tool);
  }
  const now = () => clock.now().toISOString();
  const undoContext = (): UndoContext => ({ services, snapshots });

  const info = (tool: AnyTool): ToolInfo => ({
    name: tool.name,
    category: tool.category,
    description: tool.description,
    risk: tool.risk,
    permission: deps.permissions()[tool.name] ?? null,
    mcp: offeredToMcp(tool),
  });

  function describeSafely(tool: AnyTool, input: unknown, output?: unknown): string {
    try {
      return clip(tool.describe(input, output));
    } catch {
      return tool.name;
    }
  }

  function record(
    tool: AnyTool,
    row: Pick<ActionRow, 'status' | 'summary' | 'input' | 'output' | 'error' | 'approval'> &
      Partial<Pick<ActionRow, 'undo' | 'snapshotRef' | 'id'>>,
    options: CallOptions,
    risk: ToolRisk,
  ): string {
    const id = row.id ?? ids('action');
    actions.insert({
      id,
      threadId: options.threadId ?? null,
      messageId: options.messageId ?? null,
      actor: options.actor,
      tool: tool.name,
      risk,
      undo: null,
      snapshotRef: null,
      createdAt: now(),
      ...row,
    });
    return id;
  }

  /** The action as the API shows it, with whether it can still be undone. */
  function view(row: ActionRow): AgentAction {
    const tool = byName.get(row.tool);
    let undoable = false;
    if (row.status === 'executed' && row.undo !== null && tool?.undo) {
      try {
        undoable =
          (tool.canUndo?.(undoContext(), {
            actionId: row.id as never,
            input: row.input,
            output: row.output,
            undo: row.undo,
          }) ?? null) === null;
      } catch {
        undoable = false;
      }
    }
    return {
      id: row.id as AgentAction['id'],
      tool: row.tool,
      risk: row.risk,
      actor: row.actor,
      status: row.status,
      approval: row.approval,
      summary: row.summary,
      input: row.input,
      output: row.output,
      error: row.error,
      createdAt: row.createdAt,
      undoneAt: row.undoneAt,
      undoable,
    };
  }

  function check(name: string, rawInput: unknown) {
    const tool = byName.get(name);
    if (!tool) return { ok: false as const, error: `There is no tool called "${name}".` };
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = issuesFromZod(parsed.error)
        .map((issue) => `${issue.path || 'input'}: ${issue.message}`)
        .join('; ');
      return { ok: false as const, error: `The input for ${name} is not valid (${issues}).` };
    }
    return { ok: true as const, tool, input: parsed.data as unknown };
  }

  return {
    tools: () => [...byName.values()],
    tool: (name: string) => byName.get(name),
    list: (): ToolInfo[] => [...byName.values()].map(info),
    info: (name: string): ToolInfo => {
      const tool = byName.get(name);
      if (!tool) throw new NotFoundError('There is no such tool.');
      return info(tool);
    },

    /**
     * Approves a call: a token for exactly this tool and these arguments (as validated), to pass as
     * `approval` to `call`. Only the code that shows the person the request should call this.
     */
    grant(name: string, rawInput: unknown): string {
      const checked = check(name, rawInput);
      if (!checked.ok) throw new ConflictError(checked.error);
      return approvals.grant(name, checked.input);
    },

    async call(name: string, rawInput: unknown, options: CallOptions): Promise<ToolOutcome> {
      const checked = check(name, rawInput);
      if (!checked.ok) {
        return { status: 'error', tool: name, message: checked.error, actionId: null };
      }
      const { tool, input } = checked;
      const items = Math.max(1, tool.items?.(input) ?? 1);
      const policy = decideApproval({
        risk: tool.risk,
        items,
        override: deps.permissions()[tool.name],
      });
      const summary = describeSafely(tool, input);

      if (options.actor === 'mcp' && (!offeredToMcp(tool) || policy.decision !== 'approve')) {
        const reason =
          policy.decision === 'deny'
            ? (policy.reason ?? 'This tool is turned off.')
            : 'This needs your approval inside Manuscript, which MCP clients cannot give.';
        const actionId = record(
          tool,
          { status: 'denied', summary, input, output: undefined, error: reason, approval: null },
          options,
          policy.risk,
        );
        return { status: 'denied', tool: name, risk: policy.risk, reason, actionId };
      }
      if (policy.decision === 'deny') {
        const reason = policy.reason ?? 'This tool is turned off.';
        const actionId = record(
          tool,
          { status: 'denied', summary, input, output: undefined, error: reason, approval: null },
          options,
          policy.risk,
        );
        return { status: 'denied', tool: name, risk: policy.risk, reason, actionId };
      }
      let approval: 'auto' | 'user' = 'auto';
      if (policy.decision === 'ask') {
        if (!approvals.verify(name, input, options.approval)) {
          return {
            status: 'approval_required',
            tool: name,
            risk: policy.risk,
            summary,
            reason: policy.reason ?? 'This needs your approval.',
            input,
          };
        }
        approval = 'user';
      }

      const actionId = ids('action');
      const writer = snapshots.writer(actionId);
      let taken = 0;
      const countingWriter = {
        file(relativePath: string) {
          const reference = writer.file(relativePath);
          if (reference) taken += 1;
          return reference;
        },
      };
      try {
        const result = await tool.execute(
          {
            actor: options.actor,
            services,
            signal: options.signal ?? new AbortController().signal,
            snapshot: countingWriter,
          },
          input,
        );
        const output = tool.output.safeParse(result.output);
        if (!output.success) {
          // The tool has already run: put it back if it can be, and say the result was unusable.
          let restored = false;
          if (result.undo !== undefined && tool.undo) {
            try {
              await tool.undo(undoContext(), {
                actionId: actionId as never,
                input,
                output: result.output,
                undo: result.undo,
              });
              restored = true;
            } catch (error) {
              logger.error('agent.tool.undo-after-invalid-output-failed', { tool: name, error });
            }
          }
          const message = `${name} returned something unexpected${restored ? ' and was undone' : ''}.`;
          logger.error('agent.tool.invalid-output', { tool: name, issues: output.error.issues });
          const id = record(
            tool,
            {
              id: actionId,
              status: 'failed',
              summary,
              input,
              output: undefined,
              error: message,
              approval,
            },
            options,
            policy.risk,
          );
          return { status: 'error', tool: name, message, actionId: id };
        }
        const done = describeSafely(tool, input, output.data);
        let id: string | null = null;
        if (tool.risk !== 'read') {
          id = record(
            tool,
            {
              id: actionId,
              status: 'executed',
              summary: done,
              input,
              output: output.data,
              error: null,
              approval,
              undo: result.undo ?? null,
              snapshotRef: taken > 0 ? actionId : null,
            },
            options,
            policy.risk,
          );
        }
        return {
          status: 'ok',
          tool: name,
          risk: policy.risk,
          output: output.data,
          summary: done,
          actionId: id,
        };
      } catch (error) {
        if (options.signal?.aborted) throw error;
        const message =
          error instanceof AppError ? error.message : `${name} failed for an unexpected reason.`;
        if (!(error instanceof AppError)) logger.error('agent.tool.failed', { tool: name, error });
        const id =
          tool.risk === 'read'
            ? null
            : record(
                tool,
                {
                  id: actionId,
                  status: 'failed',
                  summary,
                  input,
                  output: undefined,
                  error: message,
                  approval,
                },
                options,
                policy.risk,
              );
        return { status: 'error', tool: name, message, actionId: id };
      }
    },

    /** Records that the person declined a call that needed approval. */
    decline(name: string, rawInput: unknown, options: CallOptions): ToolOutcome {
      const checked = check(name, rawInput);
      if (!checked.ok) {
        return { status: 'error', tool: name, message: checked.error, actionId: null };
      }
      const { tool, input } = checked;
      const risk = decideApproval({ risk: tool.risk, items: tool.items?.(input) ?? 1 }).risk;
      const reason = 'The user declined.';
      const actionId = record(
        tool,
        {
          status: 'denied',
          summary: describeSafely(tool, input),
          input,
          output: undefined,
          error: reason,
          approval: null,
        },
        options,
        risk,
      );
      return { status: 'denied', tool: name, risk, reason, actionId };
    },

    actions: (limit: number): AgentAction[] => actions.recent(limit).map(view),

    /** Puts back what an action changed, if nothing has changed it since. */
    async undo(actionId: string): Promise<AgentAction> {
      const row = actions.byId(actionId);
      if (!row) throw new NotFoundError('That action does not exist.');
      if (row.status === 'undone') throw new ConflictError('That action has already been undone.');
      const tool = byName.get(row.tool);
      if (row.status !== 'executed' || row.undo === null || !tool?.undo)
        throw new ConflictError('That action cannot be undone.');
      const undoRecord = {
        actionId: row.id as never,
        input: row.input,
        output: row.output,
        undo: row.undo as Json,
      };
      const why = tool.canUndo?.(undoContext(), undoRecord) ?? null;
      if (why) throw new ConflictError(why);
      await tool.undo(undoContext(), undoRecord);
      actions.markUndone(row.id, now());
      return view(actions.byId(row.id) as ActionRow);
    },
  };
}
