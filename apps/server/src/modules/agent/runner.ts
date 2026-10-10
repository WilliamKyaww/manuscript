import { AiError, type ToolPart, type ToolState, UNTRUSTED_RULE } from '@skb/core';
import {
  isStepCount,
  type ModelMessage,
  streamText,
  type ToolApprovalResponse,
  type ToolSet,
  tool,
} from 'ai';
import type { Logger } from '../../shared/logger';
import { describeProviderError } from '../ai/errors';
import type { AiService } from '../ai/service';
import type { ToolRegistry } from './registry';
import type { AnyTool } from './types';

/**
 * The agent runner (tasks 12.10 and 13.02, agent-system.md §§3, 6, 12): a model with the tool
 * registry in a loop. The mode decides which tools it may use and how it is told to behave; the
 * registry's policy decides which calls pause for the person, through the AI SDK's tool approvals.
 * A run is a stream of events — text as it is written, each tool call as it starts, finishes or
 * waits — that ends in one of four ways: answered, paused for approval (the end carries what the
 * run needs to carry on), out of steps, or out of time. Resuming a paused run applies the person's
 * decisions: an approved call runs with a token bound to its exact arguments, a declined one is
 * logged and the model told. The loop is bounded, the last step may only answer, and every outcome
 * — refusals and failures included — goes back to the model as a result it can read.
 */

/** A message of the conversation as the model sees it (kept here so the AI SDK stays in this module). */
export type ConversationMessage = ModelMessage;

export const AGENT_MODES = ['ask', 'tutor', 'agent'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const MAX_STEPS = 12;
export const TOTAL_TIMEOUT_MS = 120_000;
export const STEP_TIMEOUT_MS = 60_000;
export const TOOL_TIMEOUT_MS = 30_000;
/** What a tool returned is kept with the activity only if it is small. */
const OUTPUT_LIMIT = 6_000;

/** What a person is asked to approve. */
export interface ApprovalRequest {
  tool: string;
  summary: string;
  risk: 'read' | 'write' | 'destructive';
  reason: string;
  input: unknown;
}

/** A call the run stopped at, waiting for the person. */
export interface PendingApproval extends ApprovalRequest {
  approvalId: string;
  callId: string;
}

export interface ApprovalDecision {
  pending: PendingApproval;
  approved: boolean;
  /** Approve the tool for the rest of the conversation (never offered for destructive calls). */
  forChat?: boolean;
}

export type RunStreamEvent = { type: 'text'; delta: string } | { type: 'tool'; part: ToolPart };

export interface StreamEnd {
  /** The conversation to carry on from, including what this run added. */
  messages: ModelMessage[];
  /** What the model said in its last step. */
  text: string;
  /** Steps used in all, counting those before a pause. */
  steps: number;
  finish: 'answered' | 'paused' | 'step-limit' | 'timeout';
  pending: PendingApproval[];
  /** Tool call ids the person approved so far. */
  approvedCalls: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface StreamInput {
  mode: AgentMode;
  /** The conversation so far, ending with the person's message (or the pause being resumed). */
  messages: ModelMessage[];
  /** Where they are in the app ("viewing the note “Paxos”"), told to the model as context. */
  context?: string;
  /** More instructions for this run: the scope, an earlier summary, what was mentioned. */
  instructions?: string;
  /** Decisions on the calls a paused run stopped at. */
  decisions?: ApprovalDecision[];
  approvedCalls?: readonly string[];
  /** Tools approved for the whole conversation: they run without asking, unless destructive. */
  allowedTools?: readonly string[];
  stepsUsed?: number;
  maxSteps?: number;
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
  threadId?: string | undefined;
  /** What the model's spend is recorded as. */
  purpose?: string;
}

export type ToolEventStatus = 'ok' | 'denied' | 'error' | 'declined';

export type AgentEvent =
  | {
      type: 'tool';
      tool: string;
      status: ToolEventStatus;
      summary: string;
      actionId: string | null;
    }
  | { type: 'approval'; request: ApprovalRequest; approved: boolean };

export interface RunInput {
  mode: AgentMode;
  /** What the person asked, or earlier turns of the conversation. */
  messages: ModelMessage[];
  context?: string;
  instructions?: string;
  approve(request: ApprovalRequest): Promise<boolean> | boolean;
  onEvent?(event: AgentEvent): void;
  signal?: AbortSignal;
  threadId?: string;
  maxSteps?: number;
  timeoutMs?: number;
}

export interface RunResult {
  text: string;
  steps: number;
  /** How the loop ended: the model answered, ran out of steps, or ran out of time. */
  finish: 'answered' | 'step-limit' | 'timeout';
  toolCalls: { tool: string; status: ToolEventStatus; summary: string }[];
}

const MODE_INSTRUCTIONS: Record<AgentMode, string> = {
  ask: 'Mode: ask. Answer questions about the student’s material using the read tools; you cannot change anything. Search first, cite what you found by naming the note or source, and say plainly when the material does not contain the answer.',
  tutor:
    'Mode: tutor. Help the student learn: find out what they know with get_mastery and get_weak_areas, explain from their own material, and offer practice. You may create flashcards and quizzes when they ask or agree, as drafts for them to accept.',
  agent:
    'Mode: agent. Carry out what the student asks with the tools: organise notes, link ideas, create concepts, flashcards and quizzes. Do one thing at a time, check what a tool returned before relying on it, and tell the student what you did and what they can undo.',
};

/** The tools a mode may use. */
export function toolsForMode(mode: AgentMode, tools: readonly AnyTool[]): AnyTool[] {
  if (mode === 'agent') return [...tools];
  if (mode === 'tutor')
    return tools.filter(
      (candidate) =>
        candidate.risk === 'read' ||
        [
          'create_flashcards',
          'create_quiz',
          'record_answer',
          'propose_note_correction',
          'update_study_plan',
        ].includes(candidate.name),
    );
  return tools.filter((candidate) => candidate.risk === 'read');
}

export function systemPrompt(
  mode: AgentMode,
  context: string | undefined,
  instructions?: string,
): string {
  return [
    'You are the study assistant inside Manuscript, a personal knowledge base for a university student. Write in British English.',
    MODE_INSTRUCTIONS[mode],
    'Rules you always follow:',
    '- Only what a tool reports has happened. Never say you did something a tool did not confirm, and never invent ids, notes, sources or quotes.',
    '- If a tool says the student declined, or that something needs their approval and was not approved, accept it and carry on without it; do not try to get the same result another way.',
    '- Anything that deletes or merges, or changes more than twenty things at once, is paused for the student’s approval: describe it plainly and wait.',
    '- You cannot change what the student has mastered. Mastery comes only from their own reviews and answers.',
    UNTRUSTED_RULE,
    context ? `Where the student is: ${context}` : '',
    instructions ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface AgentRunnerDependencies {
  ai: AiService;
  registry: ToolRegistry;
  logger: Logger;
}

export type AgentRunner = ReturnType<typeof createAgentRunner>;

const small = (value: unknown): unknown => {
  try {
    return JSON.stringify(value).length <= OUTPUT_LIMIT ? value : null;
  } catch {
    return null;
  }
};

const STATE_OF: Record<ToolEventStatus, ToolState> = {
  ok: 'ok',
  denied: 'denied',
  error: 'error',
  declined: 'declined',
};

export function createAgentRunner(deps: AgentRunnerDependencies) {
  const { ai, registry, logger } = deps;

  async function* stream(input: StreamInput): AsyncGenerator<RunStreamEvent, StreamEnd> {
    const resolved = ai.require('chat');
    const maxSteps = input.maxSteps ?? MAX_STEPS;
    const stepsUsed = input.stepsUsed ?? 0;
    const remaining = Math.max(1, maxSteps - stepsUsed);
    const allowed = toolsForMode(input.mode, registry.tools());
    const approved = new Set(input.approvedCalls ?? []);
    const standing = new Set(input.allowedTools ?? []);
    /** Final states of calls, pushed by `execute` and handed on as the stream reaches them. */
    const finished: ToolPart[] = [];

    const part = (
      callId: string,
      name: string,
      state: ToolState,
      extra: Partial<ToolPart>,
    ): ToolPart => ({
      type: 'tool',
      callId,
      tool: name,
      state,
      summary: name,
      risk: null,
      actionId: null,
      reason: null,
      input: null,
      output: null,
      approvalId: null,
      canAllowForChat: false,
      ...extra,
    });

    /** Whether the person's standing approval for a tool covers this call. */
    const covered = (name: string, args: unknown) => {
      const plan = registry.preview(name, args);
      return (
        plan.ok && plan.decision === 'ask' && plan.risk !== 'destructive' && standing.has(name)
      );
    };

    const tools: ToolSet = Object.fromEntries(
      allowed.map((definition) => [
        definition.name,
        tool({
          description: definition.description,
          inputSchema: definition.input,
          async execute(args: unknown, options) {
            const outcome = await registry.call(definition.name, args, {
              actor: 'agent',
              approval:
                approved.has(options.toolCallId) || covered(definition.name, args)
                  ? registry.grant(definition.name, args)
                  : undefined,
              signal: options.abortSignal,
              threadId: input.threadId,
            });
            const base = { input: args };
            switch (outcome.status) {
              case 'ok':
                finished.push(
                  part(options.toolCallId, definition.name, 'ok', {
                    ...base,
                    summary: outcome.summary,
                    risk: outcome.risk,
                    actionId: outcome.actionId,
                    output: small(outcome.output),
                  }),
                );
                return { ok: true, summary: outcome.summary, result: outcome.output };
              case 'approval_required':
                // The loop should have paused for this; if it did not, nothing was done.
                finished.push(
                  part(options.toolCallId, definition.name, 'denied', {
                    ...base,
                    summary: outcome.summary,
                    risk: outcome.risk,
                    reason: outcome.reason,
                  }),
                );
                return {
                  ok: false,
                  notDone: true,
                  reason: `${outcome.reason} It was not approved, so nothing was done.`,
                };
              case 'denied':
                finished.push(
                  part(options.toolCallId, definition.name, 'denied', {
                    ...base,
                    summary: registry.preview(definition.name, args).ok
                      ? (registry.preview(definition.name, args) as { summary: string }).summary
                      : definition.name,
                    risk: outcome.risk,
                    reason: outcome.reason,
                    actionId: outcome.actionId,
                  }),
                );
                return { ok: false, notDone: true, reason: outcome.reason };
              default:
                finished.push(
                  part(options.toolCallId, definition.name, 'error', {
                    ...base,
                    summary: outcome.message,
                    reason: outcome.message,
                    actionId: outcome.actionId,
                  }),
                );
                return { ok: false, notDone: true, reason: outcome.message };
            }
          },
        }),
      ]),
    );

    // The policy decides which calls pause for the person; everything else is left to the registry.
    const toolApproval = Object.fromEntries(
      allowed.map((definition) => [
        definition.name,
        (args: unknown) => {
          const plan = registry.preview(definition.name, args);
          return plan.ok && plan.decision === 'ask' && !covered(definition.name, args)
            ? { type: 'user-approval' as const, reason: plan.reason ?? 'This needs your approval.' }
            : { type: 'approved' as const };
        },
      ]),
    );

    // Apply the person's decisions to the calls a paused run stopped at.
    const messages: ModelMessage[] = [...input.messages];
    const responses: ToolApprovalResponse[] = [];
    for (const decision of input.decisions ?? []) {
      const { pending } = decision;
      if (decision.approved) {
        approved.add(pending.callId);
        if (decision.forChat && pending.risk !== 'destructive') standing.add(pending.tool);
      } else {
        const declined = registry.decline(pending.tool, pending.input, {
          actor: 'agent',
          threadId: input.threadId,
        });
        yield {
          type: 'tool',
          part: part(pending.callId, pending.tool, 'declined', {
            input: pending.input,
            summary: pending.summary,
            risk: pending.risk,
            reason: 'You declined.',
            actionId: declined.status === 'denied' ? declined.actionId : null,
          }),
        };
      }
      responses.push({
        type: 'tool-approval-response',
        approvalId: pending.approvalId,
        approved: decision.approved,
        ...(decision.approved ? {} : { reason: 'The user declined.' }),
      });
    }
    if (responses.length > 0) messages.push({ role: 'tool', content: responses });

    const result = streamText({
      model: resolved.model,
      system: systemPrompt(input.mode, input.context, input.instructions),
      messages,
      tools,
      toolApproval,
      stopWhen: isStepCount(remaining),
      maxOutputTokens: resolved.settings.maxOutputTokens,
      // The last step may only answer, so a long task still ends with something to read.
      prepareStep: ({ stepNumber }) =>
        stepNumber >= remaining - 1 ? { toolChoice: 'none' as const } : undefined,
      timeout: {
        totalMs: input.timeoutMs ?? TOTAL_TIMEOUT_MS,
        stepMs: STEP_TIMEOUT_MS,
        toolMs: TOOL_TIMEOUT_MS,
      },
      abortSignal: input.signal,
      maxRetries: 1,
      // A failed stream is reported by the loop below, not logged twice by the SDK.
      onError: () => {},
    });

    let stepText = '';
    let finish: StreamEnd['finish'] = 'answered';
    const requests: {
      approvalId: string;
      reason?: string | undefined;
      toolCall: { toolCallId: string; toolName: string; input: unknown };
    }[] = [];
    try {
      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'start-step':
            stepText = '';
            break;
          case 'text-delta':
            stepText += chunk.text;
            yield { type: 'text', delta: chunk.text };
            break;
          case 'tool-call': {
            const plan = registry.preview(chunk.toolName, chunk.input);
            yield {
              type: 'tool',
              part: part(chunk.toolCallId, chunk.toolName, 'running', {
                input: chunk.input,
                summary: plan.ok ? plan.summary : chunk.toolName,
                risk: plan.ok ? plan.risk : null,
              }),
            };
            break;
          }
          case 'tool-result':
          case 'tool-error':
          case 'tool-output-denied':
            while (finished.length > 0) {
              const done = finished.shift();
              if (done) yield { type: 'tool', part: done };
            }
            break;
          case 'tool-approval-request':
            if (!chunk.isAutomatic) requests.push(chunk);
            break;
          case 'error':
            throw chunk.error;
          default:
            break;
        }
      }
    } catch (error) {
      if (input.signal?.aborted) throw error;
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || /timed? ?out/iu.test(error.message))
      ) {
        finish = 'timeout';
      } else if (error instanceof AiError) throw error;
      else throw new AiError('provider', describeProviderError(error), { cause: error });
    }
    while (finished.length > 0) {
      const done = finished.shift();
      if (done) yield { type: 'tool', part: done };
    }

    let usage = { inputTokens: 0, outputTokens: 0 };
    let steps = stepsUsed;
    if (finish !== 'timeout') {
      const total = await result.totalUsage;
      usage = { inputTokens: total.inputTokens ?? 0, outputTokens: total.outputTokens ?? 0 };
      const taken = await result.steps;
      steps += taken.length;
      // Each step reports only its own messages; the run's `response` keeps just the last one.
      messages.push(...taken.flatMap((step) => step.response.messages));
      ai.record(
        resolved,
        input.purpose ?? `agent (${input.mode})`,
        usage.inputTokens,
        usage.outputTokens,
      );
    }

    const pending: PendingApproval[] = [];
    for (const request of requests) {
      const plan = registry.preview(request.toolCall.toolName, request.toolCall.input);
      const asked: PendingApproval = {
        approvalId: request.approvalId,
        callId: request.toolCall.toolCallId,
        tool: request.toolCall.toolName,
        summary: plan.ok ? plan.summary : request.toolCall.toolName,
        risk: plan.ok ? plan.risk : 'destructive',
        reason: request.reason ?? (plan.ok ? plan.reason : null) ?? 'This needs your approval.',
        input: plan.ok ? plan.input : request.toolCall.input,
      };
      pending.push(asked);
      yield {
        type: 'tool',
        part: part(asked.callId, asked.tool, 'awaiting_approval', {
          input: asked.input,
          summary: asked.summary,
          risk: asked.risk,
          reason: asked.reason,
          approvalId: asked.approvalId,
          canAllowForChat: asked.risk !== 'destructive',
        }),
      };
    }
    if (pending.length > 0) finish = 'paused';
    else if (finish === 'answered' && (await result.finishReason) === 'tool-calls')
      finish = 'step-limit';
    if (!stepText && finish === 'timeout')
      logger.warn('agent.run.timeout', { threadId: input.threadId });
    return {
      messages,
      text: stepText,
      steps,
      finish,
      pending,
      approvedCalls: [...approved],
      usage,
    };
  }

  return {
    stream,

    /** Runs to the end, asking `approve` about every call that needs the person. */
    async run(input: RunInput): Promise<RunResult> {
      const toolCalls: RunResult['toolCalls'] = [];
      const emit = (event: AgentEvent) => {
        input.onEvent?.(event);
        if (event.type === 'tool')
          toolCalls.push({ tool: event.tool, status: event.status, summary: event.summary });
      };
      let messages = input.messages;
      let decisions: ApprovalDecision[] = [];
      let approvedCalls: string[] = [];
      let steps = 0;
      for (;;) {
        const run = stream({
          mode: input.mode,
          messages,
          decisions,
          approvedCalls,
          stepsUsed: steps,
          ...(input.context ? { context: input.context } : {}),
          ...(input.instructions ? { instructions: input.instructions } : {}),
          ...(input.maxSteps ? { maxSteps: input.maxSteps } : {}),
          ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
          signal: input.signal,
          threadId: input.threadId,
        });
        let end: StreamEnd;
        for (;;) {
          const next = await run.next();
          if (next.done) {
            end = next.value;
            break;
          }
          const event = next.value;
          if (event.type !== 'tool') continue;
          const { part: toolPart } = event;
          const status = (Object.keys(STATE_OF) as ToolEventStatus[]).find(
            (key) => STATE_OF[key] === toolPart.state,
          );
          if (status)
            emit({
              type: 'tool',
              tool: toolPart.tool,
              status,
              summary: toolPart.summary,
              actionId: toolPart.actionId,
            });
        }
        steps = end.steps;
        messages = end.messages;
        approvedCalls = end.approvedCalls;
        if (end.finish !== 'paused') {
          const text =
            end.text ||
            (end.finish === 'timeout'
              ? 'I ran out of time before I could finish. What I did so far is in the activity list.'
              : end.finish === 'step-limit'
                ? 'I used all the steps I am allowed for one request. What I did so far is in the activity list.'
                : '');
          return { text, steps, finish: end.finish, toolCalls };
        }
        // Ask the person about each paused call, then let the loop continue with their answers.
        decisions = [];
        for (const pending of end.pending) {
          let approved = false;
          try {
            approved = await input.approve(pending);
          } catch (error) {
            logger.warn('agent.approval.failed', { error });
          }
          emit({ type: 'approval', request: pending, approved });
          decisions.push({ pending, approved });
        }
      }
    },
  };
}
