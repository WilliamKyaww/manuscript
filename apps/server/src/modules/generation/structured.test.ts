import type { LanguageModelV4 } from '@ai-sdk/provider';
import { AiError, DEFAULT_AI_PREFERENCES } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AiService } from '../ai/service';
import { generateStructured } from './structured';

/** A model that replies with the given texts in turn, remembering what it was sent. */
function scripted(replies: string[]) {
  const prompts: unknown[] = [];
  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'scripted',
    supportedUrls: {},
    async doGenerate(options) {
      prompts.push(options.prompt);
      const text = replies.shift() ?? '';
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('not used');
    },
  };
  const recorded: string[] = [];
  const ai = {
    require: () => ({
      model,
      role: 'chat',
      provider: 'test',
      modelId: 'scripted',
      settings: DEFAULT_AI_PREFERENCES.roles.chat,
    }),
    record: (_resolved: unknown, purpose: string, input: number, output: number) => {
      recorded.push(purpose);
      return { requests: 1, inputTokens: input, outputTokens: output, cost: 0 };
    },
  } as unknown as AiService;
  return { ai, prompts, recorded };
}

const Schema = z.object({ items: z.array(z.string()) });
const request = {
  role: 'chat' as const,
  schema: Schema,
  system: 'Task: test',
  content: 'Go',
  purpose: 'test',
};

describe('structured generation', () => {
  it('returns the object and records the usage', async () => {
    const { ai, recorded } = scripted(['{"items":["a"]}']);
    const result = await generateStructured(ai, request);
    expect(result).toEqual({
      object: { items: ['a'] },
      usage: { requests: 1, inputTokens: 10, outputTokens: 5, cost: 0 },
      repaired: false,
    });
    expect(recorded).toEqual(['test']);
  });

  it('repairs an invalid reply once, showing the model what was wrong', async () => {
    const { ai, prompts, recorded } = scripted(['{"items": 3}', '{"items":["b"]}']);
    const result = await generateStructured(ai, request);
    expect(result.object).toEqual({ items: ['b'] });
    expect(result.repaired).toBe(true);
    expect(result.usage.requests).toBe(2);
    expect(recorded).toEqual(['test', 'test']);
    expect(JSON.stringify(prompts[1])).toContain('That reply was not valid');
  });

  it('gives up after a second invalid reply', async () => {
    const { ai } = scripted(['not json', '{"wrong":true}']);
    await expect(generateStructured(ai, request)).rejects.toBeInstanceOf(AiError);
  });
});
