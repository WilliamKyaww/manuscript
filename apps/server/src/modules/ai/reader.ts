import { AiError, GeneratedReadingSchema } from '@skb/core';
import { transcribe } from 'ai';
import { describeProviderError } from './errors';
import type { AiService } from './service';
import { generateStructured } from './structured';

/**
 * Reading what has no text layer (tasks 11.10–11.11): recordings are transcribed by the
 * transcription model, with timed segments; images and scanned pages are read by the chat model
 * (which must accept images and PDFs). The source parsers use this through the `AiReader`
 * interface, so the AI SDK stays inside this module.
 */

/** OpenAI's transcription endpoint takes files up to 25 MB. */
export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
/** Images and scans sent to a model: Anthropic's limits for PDFs are 32 MB and 100 pages. */
export const MAX_READ_BYTES = 30 * 1024 * 1024;
export const MAX_READ_PAGES = 100;

export interface TranscriptSegment {
  text: string;
  startSecond: number;
  endSecond: number;
}

export interface Transcript {
  text: string;
  /** Timed segments; empty when the model gives none (some models return text only). */
  segments: TranscriptSegment[];
  durationSeconds: number | null;
  language: string | null;
}

export interface AiReader {
  /** Why recordings cannot be transcribed now (or images and scans read), or null. */
  unavailable(task: 'transcribe' | 'read'): string | null;
  transcribe(input: { bytes: Uint8Array; signal: AbortSignal }): Promise<Transcript>;
  read(input: {
    bytes: Uint8Array;
    mediaType: string;
    kind: 'image' | 'scan';
    pages: number;
    signal: AbortSignal;
  }): Promise<{ page: number; text: string }[]>;
}

export function readingPrompt(kind: 'image' | 'scan'): string {
  return [
    'Task: read',
    kind === 'image'
      ? 'Transcribe the text in this image exactly, keeping its structure as Markdown. If it is a diagram or a photograph, describe what it shows in a short paragraph instead, naming every label.'
      : 'Transcribe the text on each page of this scanned document exactly, keeping its structure as Markdown. Describe any figure in a sentence in [brackets].',
    'Return one entry per page, numbered from 1. Do not add anything that is not on the page.',
  ].join('\n');
}

export function createAiReader(ai: AiService): AiReader {
  return {
    unavailable(task) {
      const status = ai.status();
      const role = task === 'transcribe' ? status.roles.transcription : status.roles.chat;
      if (!role.ready)
        return (
          role.reason ??
          (task === 'transcribe'
            ? 'Choose a transcription model in Settings → AI.'
            : 'AI is not set up. Add a provider in Settings → AI.')
        );
      if (status.month.exhausted) return 'This month’s AI budget is used up.';
      return null;
    },

    async transcribe({ bytes, signal }) {
      const resolved = ai.requireTranscription();
      try {
        const result = await transcribe({
          model: resolved.model,
          audio: bytes,
          abortSignal: signal,
          maxRetries: 1,
        });
        const duration = result.durationInSeconds ?? result.segments.at(-1)?.endSecond ?? null;
        ai.recordTranscription(resolved, 'transcribe a recording', duration ?? 0);
        return {
          text: result.text,
          segments: result.segments.map((segment) => ({
            text: segment.text,
            startSecond: segment.startSecond,
            endSecond: segment.endSecond,
          })),
          durationSeconds: duration,
          language: result.language ?? null,
        };
      } catch (error) {
        if (error instanceof AiError || signal.aborted) throw error;
        throw new AiError('provider', describeProviderError(error), { cause: error });
      }
    },

    async read({ bytes, mediaType, kind, pages, signal }) {
      const { object } = await generateStructured(ai, {
        role: 'chat',
        schema: GeneratedReadingSchema,
        system: readingPrompt(kind),
        content: [
          { type: 'text', text: `Pages: ${pages}` },
          { type: 'file', data: bytes, mediaType },
        ],
        purpose: kind === 'image' ? 'read an image' : 'read scanned pages',
        maxOutputTokens: Math.min(16_000, 1_500 * Math.max(1, pages)),
        signal,
      });
      return object.pages;
    },
  };
}
