import {
  AiError,
  type NormalisedDocument,
  type NormalisedSection,
  type SourceParser,
} from '@skb/core';
import { type AiReader, MAX_TRANSCRIPTION_BYTES, type TranscriptSegment } from '../../ai/reader';

/**
 * Recordings (task 11.10): audio and video are transcribed by the transcription model and kept as
 * sections of about a minute each, with the time as locator — so search hits, citations and
 * generated cards open the recording at that moment. Without a transcription model the recording
 * is imported all the same (it can be played), with a warning saying how to transcribe it.
 */

export const MEDIA_PARSER_VERSION = 'media-1';

/** Seconds of speech per section. */
const SECTION_SECONDS = 60;

const clean = (text: string) => text.replace(/\s+/gu, ' ').trim();

function section(sourceId: string, start: number, end: number, text: string): NormalisedSection {
  const startMs = Math.max(0, Math.round(start * 1000));
  const seconds = Math.floor(start);
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return {
    kind: 'segment',
    label,
    text,
    notes: null,
    headingPath: [],
    locator: {
      kind: 'media',
      sourceId,
      startMs,
      endMs: Math.max(startMs, Math.round(end * 1000)),
    },
  };
}

/** Joins timed segments into sections of about a minute, never splitting a segment. */
export function groupSegments(
  segments: readonly TranscriptSegment[],
  sourceId: string,
  seconds = SECTION_SECONDS,
): NormalisedSection[] {
  const sections: NormalisedSection[] = [];
  let current: TranscriptSegment[] = [];
  const flush = () => {
    const text = clean(current.map((segment) => segment.text).join(' '));
    const first = current[0];
    const last = current.at(-1);
    if (text && first && last)
      sections.push(section(sourceId, first.startSecond, last.endSecond, text));
    current = [];
  };
  for (const segment of segments) {
    const first = current[0];
    if (first && segment.startSecond - first.startSecond >= seconds) flush();
    current.push(segment);
  }
  flush();
  return sections;
}

/**
 * Sections for a transcript without times (some models return text only): about 150 words each,
 * with times estimated from where the words fall in the recording.
 */
export function estimateSections(
  text: string,
  durationSeconds: number | null,
  sourceId: string,
): NormalisedSection[] {
  const words = clean(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const duration = durationSeconds ?? words.length / 2.5;
  const sections: NormalisedSection[] = [];
  for (let start = 0; start < words.length; start += 150) {
    const end = Math.min(words.length, start + 150);
    sections.push(
      section(
        sourceId,
        (start / words.length) * duration,
        (end / words.length) * duration,
        words.slice(start, end).join(' '),
      ),
    );
  }
  return sections;
}

const empty = (warning: { code: string; message: string }): NormalisedDocument => ({
  title: null,
  pageCount: null,
  sections: [],
  warnings: [warning],
  metadata: {},
});

export function createMediaParser(reader: AiReader | null): SourceParser {
  return {
    kinds: ['audio', 'video'],
    version: MEDIA_PARSER_VERSION,
    async parse({ bytes, sourceId, signal, onProgress }) {
      const problem = reader ? reader.unavailable('transcribe') : 'AI is not available.';
      if (problem || !reader)
        return empty({
          code: 'needs-ai',
          message: `Not transcribed yet: ${problem} Then choose “Read again”. The recording can be played meanwhile.`,
        });
      if (bytes.length > MAX_TRANSCRIPTION_BYTES)
        return empty({
          code: 'too-long',
          message:
            'Recordings over 25 MB cannot be transcribed in one piece yet. Export the audio as a smaller file (mono MP3 at 64 kbit/s holds about 50 minutes in 25 MB) and import that.',
        });
      onProgress?.(0.1);
      let transcript: Awaited<ReturnType<AiReader['transcribe']>>;
      try {
        transcript = await reader.transcribe({ bytes, signal });
      } catch (error) {
        // Not set up or over budget: import without a transcript; a provider failure is retried.
        if (error instanceof AiError && error.reason !== 'provider')
          return empty({ code: 'needs-ai', message: `Not transcribed yet: ${error.message}` });
        throw error;
      }
      onProgress?.(0.9);
      const timed = transcript.segments.length > 0;
      const sections = timed
        ? groupSegments(transcript.segments, sourceId)
        : estimateSections(transcript.text, transcript.durationSeconds, sourceId);
      const warnings = [];
      if (sections.length === 0)
        warnings.push({ code: 'no-speech', message: 'No speech was found in the recording.' });
      else if (!timed)
        warnings.push({
          code: 'estimated-times',
          message:
            'The transcription model gave no timestamps, so times are estimated from where the words fall. whisper-1 gives exact times.',
        });
      return {
        title: null,
        pageCount: null,
        sections,
        warnings,
        metadata: {
          durationSeconds: transcript.durationSeconds,
          language: transcript.language,
          transcribed: true,
        },
      };
    },
  };
}
