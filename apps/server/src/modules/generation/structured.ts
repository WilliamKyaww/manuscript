import { AiError } from '@skb/core';
import {
  generateText,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  type UserContent,
} from 'ai';
import type { z } from 'zod';
import { describeProviderError } from '../ai/errors';
import type { AiService } from '../ai/service';
import type { Totals } from '../ai/usage';

/**
 * Structured generation (task 11.02): asks a model for an object matching a Zod schema. A reply
 * that does not parse or validate gets one repair attempt — the model sees its reply and what was
 * wrong with it — before the request fails. Every attempt's usage is recorded.
 */

export interface StructuredRequest<T> {
  role: 'chat' | 'fast';
  schema: z.ZodType<T>;
  system: string;
  /** The user message: text, or text with images and files. */
  content: UserContent;
  purpose: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  object: T;
  usage: Totals;
  repaired: boolean;
}

const TIMEOUT_MS = 180_000;

const add = (a: Totals, b: Totals): Totals => ({
  requests: a.requests + b.requests,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cost: a.cost + b.cost,
});

const NONE: Totals = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };

function reason(error: NoObjectGeneratedError): string {
  const cause = error.cause instanceof Error ? error.cause.message : error.message;
  return cause.replace(/\s+/gu, ' ').slice(0, 600);
}

export async function generateStructured<T>(
  ai: AiService,
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const resolved = ai.require(request.role);
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);
  const maxOutputTokens = request.maxOutputTokens ?? resolved.settings.maxOutputTokens;
  let usage = NONE;

  const attempt = async (messages: ModelMessage[]) => {
    const result = await generateText({
      model: resolved.model,
      system: request.system,
      messages,
      output: Output.object({ schema: request.schema }),
      maxOutputTokens,
      abortSignal: signal,
      maxRetries: 1,
    });
    usage = add(
      usage,
      ai.record(
        resolved,
        request.purpose,
        result.totalUsage.inputTokens ?? 0,
        result.totalUsage.outputTokens ?? 0,
      ),
    );
    return result.output as T;
  };

  const first: ModelMessage[] = [{ role: 'user', content: request.content }];
  try {
    return { object: await attempt(first), usage, repaired: false };
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw asAiError(error);
    usage = add(
      usage,
      ai.record(
        resolved,
        request.purpose,
        error.usage?.inputTokens ?? 0,
        error.usage?.outputTokens ?? 0,
      ),
    );
    const repair: ModelMessage[] = [
      ...first,
      { role: 'assistant', content: error.text ?? '' },
      {
        role: 'user',
        content: `That reply was not valid: ${reason(error)}\nReply again with only the JSON object, following the schema exactly.`,
      },
    ];
    try {
      return { object: await attempt(repair), usage, repaired: true };
    } catch (second) {
      if (NoObjectGeneratedError.isInstance(second))
        throw new AiError(
          'provider',
          `The model’s reply did not match what was asked for, twice (${reason(second)}). Try again, or choose a more capable model.`,
        );
      throw asAiError(second);
    }
  }
}

function asAiError(error: unknown): unknown {
  if (error instanceof AiError) return error;
  if (error instanceof Error && error.name === 'AbortError') return error;
  return new AiError('provider', describeProviderError(error), { cause: error });
}
