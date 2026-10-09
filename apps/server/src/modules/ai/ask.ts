import {
  AiError,
  type AskEvent,
  type AskFilter,
  type AskScope,
  checkCitations,
  classifyGrounding,
  estimateTokens,
  UNTRUSTED_RULE,
  wrapUntrusted,
} from '@skb/core';
import { streamText } from 'ai';
import type { Logger } from '../../shared/logger';
import { describeProviderError } from './errors';
import type { RetrievalService, RetrievedPassage } from './retrieval';
import type { AiService } from './service';

/**
 * Grounded questions and answers (task 10.09, agent-system.md §§3–5). Passages are retrieved and
 * wrapped as untrusted data; the model is told to cite them by key; the answer streams back; then
 * unknown keys are dropped and the answer is labelled by how much of it is cited. In "my sources"
 * and "my knowledge base" the model may not fill gaps from general knowledge — and when nothing is
 * found, no model is asked at all.
 */

const NOT_FOUND = 'I could not find this in your sources.';
const OVERHEAD_TOKENS = 900;
const TOTAL_TIMEOUT_MS = 120_000;

const SCOPE_RULES: Record<AskScope, string> = {
  sources:
    'Scope: sources. Answer only from the passages, which come from the student’s lecture material. If they do not contain the answer, say "I could not find this in your sources." and stop. Do not add anything from general knowledge.',
  knowledge:
    'Scope: knowledge base. Answer only from the passages, which come from the student’s lecture material and notes. If they do not contain the answer, say "I could not find this in your sources." and stop. Do not add anything from general knowledge.',
  general:
    'Scope: general. Prefer the passages and cite them. You may add general knowledge where they fall short, but never put a citation key on it: uncited sentences are shown as general knowledge.',
};

export function systemPrompt(scope: AskScope): string {
  return [
    'You help a university student understand their course material.',
    SCOPE_RULES[scope],
    'After each sentence that uses a passage, cite it with its key in square brackets, such as [S2] or [S1, S3]. Use only keys that appear in the passages.',
    'Be concise and precise: a direct answer first, then the reasoning. Use Markdown, and $…$ for maths. Write in British English.',
    UNTRUSTED_RULE,
  ].join('\n\n');
}

export function userPrompt(question: string, passages: readonly RetrievedPassage[]): string {
  const material = passages
    .map((passage) =>
      wrapUntrusted({
        key: passage.key,
        title: passage.title,
        location: passage.label,
        text: passage.text,
      }),
    )
    .join('\n\n');
  return `${material ? `Passages:\n\n${material}\n\n` : 'No passages were found.\n\n'}Question: ${question}`;
}

export interface AskDependencies {
  ai: AiService;
  retrieval: RetrievalService;
  logger: Logger;
}

export type AskService = ReturnType<typeof createAskService>;

export function createAskService(deps: AskDependencies) {
  const { ai, retrieval, logger } = deps;

  return {
    async *ask(
      input: { question: string; scope: AskScope; filter: AskFilter },
      signal: AbortSignal,
    ): AsyncGenerator<AskEvent> {
      let chat: ReturnType<AiService['require']>;
      try {
        chat = ai.require('chat');
      } catch (error) {
        if (error instanceof AiError && error.reason !== 'provider') {
          yield { type: 'error', code: error.reason, message: error.message };
          return;
        }
        throw error;
      }
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(TOTAL_TIMEOUT_MS)]);
      const { contextTokens } = ai.settings().preferences;
      const { passages } = await retrieval.retrieve({
        question: input.question,
        scope: input.scope,
        filter: input.filter,
        budgetTokens: Math.max(
          500,
          contextTokens - estimateTokens(input.question) - OVERHEAD_TOKENS,
        ),
        signal: timeout,
      });
      yield {
        type: 'passages',
        passages: passages.map(({ tokens: _tokens, ...passage }) => passage),
      };

      if (passages.length === 0 && input.scope !== 'general') {
        yield {
          type: 'done',
          text: NOT_FOUND,
          cited: [],
          dropped: [],
          grounding: 'not_found',
          usage: null,
        };
        return;
      }

      const result = streamText({
        model: chat.model,
        system: systemPrompt(input.scope),
        prompt: userPrompt(input.question, passages),
        maxOutputTokens: chat.settings.maxOutputTokens,
        abortSignal: timeout,
        maxRetries: 1,
      });
      let text = '';
      try {
        for await (const part of result.stream) {
          if (part.type === 'text-delta') {
            text += part.text;
            yield { type: 'text', delta: part.text };
          } else if (part.type === 'error') throw part.error;
          else if (part.type === 'abort') throw new DOMException('Aborted', 'AbortError');
        }
      } catch (error) {
        const cancelled = signal.aborted;
        if (!cancelled) logger.warn('ai.ask.failed', { message: describeProviderError(error) });
        yield {
          type: 'error',
          code: cancelled ? 'cancelled' : 'provider',
          message: cancelled ? 'Stopped.' : describeProviderError(error),
        };
        return;
      }
      const usage = await result.totalUsage;
      const spent = ai.record(chat, 'ask', usage.inputTokens ?? 0, usage.outputTokens ?? 0);
      const check = checkCitations(text, new Set(passages.map((passage) => passage.key)));
      const trimmed = check.text.trim();
      const grounding =
        passages.length === 0 || trimmed === NOT_FOUND
          ? trimmed === NOT_FOUND
            ? 'not_found'
            : 'general'
          : classifyGrounding(check.text);
      yield {
        type: 'done',
        text: check.text,
        cited: check.used,
        dropped: check.unknown,
        grounding,
        usage: spent,
      };
    },
  };
}
