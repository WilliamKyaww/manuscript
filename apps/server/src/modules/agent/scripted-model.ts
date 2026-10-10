import type { LanguageModelV4, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { DEFAULT_AI_PREFERENCES } from '@skb/core';
import type { AiService } from '../ai/service';

/**
 * A model that plays a script (agent-system.md §14): each call to it returns the next turn — some
 * tool calls, or text — and remembers what it was sent. Used to test the agent loop with no
 * network and no randomness, including a model that has been talked into doing something it
 * should not (a prompt injection).
 */

export type Turn = { text: string } | { calls: { name: string; input: unknown }[]; text?: string };

export interface ScriptedModel {
  model: LanguageModelV4;
  /** The prompt of every call so far. */
  prompts: LanguageModelV4Prompt[];
  /** The names of the tools offered on every call so far. */
  offered: string[][];
  /** An AI service stand-in that hands out this model. */
  ai: AiService;
}

export function scriptedModel(turns: readonly Turn[]): ScriptedModel {
  const queue = [...turns];
  const prompts: LanguageModelV4Prompt[] = [];
  const offered: string[][] = [];
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };
  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'scripted',
    modelId: 'script',
    supportedUrls: {},
    async doGenerate(options) {
      prompts.push(options.prompt);
      offered.push((options.tools ?? []).map((tool) => tool.name));
      const turn = queue.shift() ?? { text: 'The script has ended.' };
      if ('calls' in turn) {
        return {
          content: [
            ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
            ...turn.calls.map((call, index) => ({
              type: 'tool-call' as const,
              toolCallId: `call_${prompts.length}_${index}`,
              toolName: call.name,
              input: JSON.stringify(call.input),
            })),
          ],
          finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ type: 'text', text: turn.text }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage,
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('The scripted model does not stream.');
    },
  };
  const ai = {
    require: () => ({
      model,
      role: 'chat',
      provider: 'scripted',
      modelId: 'script',
      settings: DEFAULT_AI_PREFERENCES.roles.chat,
    }),
    record: () => ({ requests: 1, inputTokens: 0, outputTokens: 0, cost: 0 }),
  } as unknown as AiService;
  return { model, prompts, offered, ai };
}
