import { AiError, UNTRUSTED_RULE } from '@skb/core';
import {
  generateText,
  isStepCount,
  type ModelMessage,
  type ToolApprovalResponse,
  type ToolSet,
  tool,
} from 'ai';
import type { Logger } from '../../shared/logger';
import { describeProviderError } from '../ai/errors';
import type { AiService } from '../ai/service';
import { offeredToMcp, type ToolRegistry } from './registry';
import type { AnyTool } from './types';

/**
 * The agent runner (task 12.10, agent-system.md §§3, 6, 12): a model with the tool registry in a
 * loop. The mode decides which tools it may use and how it is told to behave; the registry's
 * policy decides which calls pause for the person, through the AI SDK's tool approvals — a call
 * that needs approval stops the loop, the `approve` callback shows it to the person, and only an
 * approved call runs, with a token bound to its exact arguments. The loop is bounded (steps and
 * time), the last step may only answer, and every outcome — refusals and failures included — goes
 * back to the model as a result it can read, never as silence.
 */

export const AGENT_MODES = ['ask', 'tutor', 'agent'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const MAX_STEPS = 12;
export const TOTAL_TIMEOUT_MS = 120_000;
export const STEP_TIMEOUT_MS = 60_000;
export const TOOL_TIMEOUT_MS = 30_000;

/** What a person is asked to approve. */
export interface ApprovalRequest {
  tool: string;
  summary: string;
  risk: 'read' | 'write' | 'destructive';
  reason: string;
  input: unknown;
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
  /** Where they are in the app ("viewing the note “Paxos”"), told to the model as context. */
  context?: string;
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
  if (mode === 'agent') return tools.filter(offeredToAgent);
  if (mode === 'tutor')
    return tools.filter(
      (candidate) =>
        candidate.risk === 'read' || ['create_flashcards', 'create_quiz'].includes(candidate.name),
    );
  return tools.filter((candidate) => candidate.risk === 'read');
}

const offeredToAgent = (_tool: AnyTool) => true;

export function systemPrompt(mode: AgentMode, context: string | undefined): string {
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

export function createAgentRunner(deps: AgentRunnerDependencies) {
  const { ai, registry, logger } = deps;

  return {
    async run(input: RunInput): Promise<RunResult> {
      const resolved = ai.require('chat');
      const maxSteps = input.maxSteps ?? MAX_STEPS;
      const allowed = toolsForMode(input.mode, registry.tools());
      const approvedCalls = new Set<string>();
      const toolCalls: RunResult['toolCalls'] = [];
      const emit = (event: AgentEvent) => {
        input.onEvent?.(event);
        if (event.type === 'tool')
          toolCalls.push({ tool: event.tool, status: event.status, summary: event.summary });
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
                approval: approvedCalls.has(options.toolCallId)
                  ? registry.grant(definition.name, args)
                  : undefined,
                signal: options.abortSignal,
                threadId: input.threadId,
              });
              switch (outcome.status) {
                case 'ok':
                  emit({
                    type: 'tool',
                    tool: definition.name,
                    status: 'ok',
                    summary: outcome.summary,
                    actionId: outcome.actionId,
                  });
                  return { ok: true, summary: outcome.summary, result: outcome.output };
                case 'approval_required':
                  // The loop should have paused for this; if it did not, nothing was done.
                  emit({
                    type: 'tool',
                    tool: definition.name,
                    status: 'denied',
                    summary: outcome.summary,
                    actionId: null,
                  });
                  return {
                    ok: false,
                    notDone: true,
                    reason: `${outcome.reason} It was not approved, so nothing was done.`,
                  };
                case 'denied':
                  emit({
                    type: 'tool',
                    tool: definition.name,
                    status: 'denied',
                    summary: definition.name,
                    actionId: outcome.actionId,
                  });
                  return { ok: false, notDone: true, reason: outcome.reason };
                default:
                  emit({
                    type: 'tool',
                    tool: definition.name,
                    status: 'error',
                    summary: outcome.message,
                    actionId: outcome.actionId,
                  });
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
            return plan.ok && plan.decision === 'ask'
              ? {
                  type: 'user-approval' as const,
                  reason: plan.reason ?? 'This needs your approval.',
                }
              : { type: 'approved' as const };
          },
        ]),
      );

      const messages: ModelMessage[] = [...input.messages];
      let steps = 0;
      let text = '';
      let finish: RunResult['finish'] = 'answered';
      const system = systemPrompt(input.mode, input.context);

      for (;;) {
        const remaining = maxSteps - steps;
        if (remaining <= 0) {
          finish = 'step-limit';
          break;
        }
        let result: Awaited<ReturnType<typeof generateText<ToolSet>>>;
        try {
          result = await generateText({
            model: resolved.model,
            system,
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
          });
        } catch (error) {
          if (input.signal?.aborted) throw error;
          if (
            error instanceof Error &&
            (error.name === 'TimeoutError' || /timed? ?out/iu.test(error.message))
          ) {
            finish = 'timeout';
            break;
          }
          throw new AiError('provider', describeProviderError(error), { cause: error });
        }
        ai.record(
          resolved,
          `agent (${input.mode})`,
          result.totalUsage.inputTokens ?? 0,
          result.totalUsage.outputTokens ?? 0,
        );
        steps += result.steps.length;
        messages.push(...result.response.messages);
        text = result.text || text;

        const requests = result.content.flatMap((part) =>
          part.type === 'tool-approval-request' && !part.isAutomatic ? [part] : [],
        );
        if (requests.length === 0) {
          // Still calling tools when the steps ran out: it never got to answer.
          if (result.finishReason === 'tool-calls') finish = 'step-limit';
          break;
        }

        // Ask the person about each paused call, then let the loop continue with their answers.
        const responses: ToolApprovalResponse[] = [];
        for (const request of requests) {
          const plan = registry.preview(request.toolCall.toolName, request.toolCall.input);
          const asked: ApprovalRequest = plan.ok
            ? {
                tool: request.toolCall.toolName,
                summary: plan.summary,
                risk: plan.risk,
                reason: request.reason ?? plan.reason ?? 'This needs your approval.',
                input: plan.input,
              }
            : {
                tool: request.toolCall.toolName,
                summary: request.toolCall.toolName,
                risk: 'destructive',
                reason: request.reason ?? 'This needs your approval.',
                input: request.toolCall.input,
              };
          let approved = false;
          try {
            approved = await input.approve(asked);
          } catch (error) {
            logger.warn('agent.approval.failed', { error });
          }
          input.onEvent?.({ type: 'approval', request: asked, approved });
          if (approved) approvedCalls.add(request.toolCall.toolCallId);
          else {
            const declined = registry.decline(request.toolCall.toolName, request.toolCall.input, {
              actor: 'agent',
              threadId: input.threadId,
            });
            emit({
              type: 'tool',
              tool: request.toolCall.toolName,
              status: 'declined',
              summary: asked.summary,
              actionId: declined.status === 'denied' ? declined.actionId : null,
            });
          }
          responses.push({
            type: 'tool-approval-response',
            approvalId: request.approvalId,
            approved,
            ...(approved ? {} : { reason: 'The user declined.' }),
          });
        }
        messages.push({ role: 'tool', content: responses });
      }
      if (!text && finish !== 'answered')
        text =
          finish === 'timeout'
            ? 'I ran out of time before I could finish. What I did so far is in the activity list.'
            : 'I used all the steps I am allowed for one request. What I did so far is in the activity list.';
      return { text, steps, finish, toolCalls };
    },
  };
}
