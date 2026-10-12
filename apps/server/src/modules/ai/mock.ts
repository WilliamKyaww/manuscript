import type {
  EmbeddingModelV4,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import { mockAgentTurn } from './mock-agent';
import { mockStructured } from './mock-generation';
import { mockWriting } from './mock-writing';
import { streamOf } from './stream-parts';

/**
 * Built-in test models (`SKB_AI_PROVIDER=mock`, agent-system.md §14): deterministic, offline, and
 * shaped like real answers — the chat model answers from the passages it is given and cites them,
 * so grounding, citations and the interface can be tested end to end without a provider.
 */

const PASSAGE = /<untrusted_source id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/untrusted_source>/gu;

function promptText(prompt: LanguageModelV4Prompt): { system: string; user: string } {
  let system = '';
  let user = '';
  for (const message of prompt) {
    if (message.role === 'system') system += `${message.content}\n`;
    if (message.role === 'user')
      for (const part of message.content) if (part.type === 'text') user += `${part.text}\n`;
  }
  return { system, user };
}

const firstSentence = (text: string) => {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const sentence = flat.match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? flat;
  return sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence;
};

/** What the test model says to a prompt. */
export function mockAnswer(prompt: LanguageModelV4Prompt): string {
  const { system, user } = promptText(prompt);
  if (/reply with ok/iu.test(user)) return 'OK';
  // Compacting a long conversation (Phase 13): a summary that names what was talked about.
  if (/^Task: summarise-chat/mu.test(system))
    return `Earlier in this conversation: ${firstSentence(user.replace(/^(?:student|assistant): /gimu, ''))}`;
  // Writing help on a selection (Phase 26): a predictable change of the selected text.
  const writing = /^Task: write-([\w-]+)/mu.exec(system)?.[1];
  if (writing)
    return mockWriting(
      writing,
      [...user.matchAll(PASSAGE)][0]?.[2] ?? '',
      /^Instruction: (.*)$/mu.exec(system)?.[1] ?? '',
    );
  const passages = [...user.matchAll(PASSAGE)].slice(0, 2);
  const general = /Scope: general/u.test(system);
  if (passages.length === 0)
    return general
      ? 'Your files say nothing about this, so this answer is general knowledge from the test model.'
      : 'I could not find this in your sources.';
  const cited = passages
    .map(([, key, text]) => `${firstSentence(text ?? '').replace(/[.!?…]$/u, '')} [${key}].`)
    .join(' ');
  return `According to your material: ${cited}${general ? ' In general, this test model adds an uncited sentence of its own.' : ''}`;
}

const tokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

function usageOf(options: LanguageModelV4CallOptions, text: string): LanguageModelV4Usage {
  const { system, user } = promptText(options.prompt);
  const input = tokens(system + user);
  const output = tokens(text);
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

/** What the test model replies: JSON when asked for an object, otherwise prose. */
function reply(options: LanguageModelV4CallOptions): string {
  if (options.responseFormat?.type === 'json') return mockStructured(options.prompt) ?? '{}';
  return mockAnswer(options.prompt);
}

/** The test agent's next step (tool calls or an answer) when the request comes with tools. */
function agentReply(options: LanguageModelV4CallOptions) {
  const turn = mockAgentTurn(options);
  if (!turn) return null;
  if ('text' in turn)
    return {
      content: [{ type: 'text' as const, text: turn.text }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      text: turn.text,
    };
  return {
    content: turn.calls.map((call, index) => ({
      type: 'tool-call' as const,
      toolCallId: `mock_${options.prompt.length}_${index}`,
      toolName: call.name,
      input: JSON.stringify(call.input),
    })),
    finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
    text: JSON.stringify(turn.calls),
  };
}

export function createMockLanguageModel(modelId = 'mock-chat'): LanguageModelV4 {
  const finishReason = { unified: 'stop' as const, raw: 'stop' };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      const agent = agentReply(options);
      if (agent)
        return {
          content: agent.content,
          finishReason: agent.finishReason,
          usage: usageOf(options, agent.text),
          warnings: [],
        };
      const text = reply(options);
      return {
        content: [{ type: 'text', text }],
        finishReason,
        usage: usageOf(options, text),
        warnings: [],
      };
    },
    async doStream(options) {
      const agent = agentReply(options);
      if (agent)
        return {
          stream: streamOf(agent.content, agent.finishReason, usageOf(options, agent.text)),
        };
      const text = reply(options);
      // Word by word, so the interface sees a real stream.
      const pieces = text.match(/\S+\s*/gu) ?? [text];
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'mock' },
        ...pieces.map((delta) => ({ type: 'text-delta' as const, id: 'mock', delta })),
        { type: 'text-end', id: 'mock' },
        { type: 'finish', finishReason, usage: usageOf(options, text) },
      ];
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

export const MOCK_DIMENSIONS = 256;

/** Hashes words into a fixed-size vector, so texts sharing words are close (FNV-1a buckets). */
export function mockEmbedding(text: string): number[] {
  const vector = new Array<number>(MOCK_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < word.length; index += 1) {
      hash ^= word.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    const slot = hash % MOCK_DIMENSIONS;
    vector[slot] = (vector[slot] as number) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function createMockEmbeddingModel(modelId = 'mock-embedding'): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: false,
    async doEmbed({ values }) {
      return {
        embeddings: values.map(mockEmbedding),
        usage: { tokens: values.reduce((sum, value) => sum + tokens(value), 0) },
        warnings: [],
      };
    },
  };
}

/**
 * The test transcriber cannot hear, so a test recording carries its own transcript: lines
 * "[start-end] words" between "MOCK TRANSCRIPT" and "END TRANSCRIPT" anywhere in the file (an ID3
 * comment, say). Any other recording becomes one numbered sentence per half-minute of its length,
 * reckoned at 16 kB a second.
 */
export function mockTranscript(audio: Uint8Array | string): {
  text: string;
  segments: { text: string; startSecond: number; endSecond: number }[];
  durationInSeconds: number;
} {
  const bytes = typeof audio === 'string' ? Buffer.from(audio, 'base64') : audio;
  const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const scripted = content.match(/MOCK TRANSCRIPT\r?\n([\s\S]*?)\r?\nEND TRANSCRIPT/u)?.[1];
  const segments = scripted
    ? [...scripted.matchAll(/^\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]\s*(.+)$/gmu)].map((match) => ({
        startSecond: Number(match[1]),
        endSecond: Number(match[2]),
        text: (match[3] ?? '').trim(),
      }))
    : Array.from({ length: Math.max(1, Math.ceil(bytes.length / 16_000 / 30)) }, (_, index) => ({
        startSecond: index * 30,
        endSecond: Math.min((index + 1) * 30, Math.max(1, bytes.length / 16_000)),
        text: `Test transcript, part ${index + 1}.`,
      }));
  return {
    text: segments.map((segment) => segment.text).join(' '),
    segments,
    durationInSeconds: segments.at(-1)?.endSecond ?? 0,
  };
}

export function createMockTranscriptionModel(modelId = 'mock-transcription'): TranscriptionModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId,
    async doGenerate({ audio }) {
      const transcript = mockTranscript(audio);
      return {
        ...transcript,
        language: 'en',
        warnings: [],
        response: { timestamp: new Date(0), modelId },
      };
    },
  };
}
