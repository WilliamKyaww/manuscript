import type { Locator, NormalisedDocument, NormalisedSection } from './types';

/**
 * Splits a parsed source into retrieval chunks (task 5.12, ADR-0010). Chunks never cross a section
 * boundary, so every chunk has one precise locator: the page (with a character range), the slide
 * (body or speaker notes), or the heading path with the paragraph or line where the chunk starts.
 * Long sections are cut at paragraph, then line, then sentence, then word boundaries, and
 * consecutive chunks share a little overlap so a sentence near a cut is found in either.
 */

export interface ChunkDraft {
  /** Index of the section in `NormalisedDocument.sections`. */
  sectionIndex: number;
  /** Position of the chunk in the whole document. */
  ordinal: number;
  text: string;
  /** "Document › section" path, indexed with the text so headings and titles help matching. */
  contextPrefix: string;
  tokenEstimate: number;
  locator: Locator;
}

export interface ChunkOptions {
  /** Upper bound per chunk (estimated tokens). */
  maxTokens?: number;
  /** Trailing text repeated at the start of the next chunk of the same section. */
  overlapTokens?: number;
}

export const DEFAULT_CHUNK_TOKENS = 300;
export const DEFAULT_OVERLAP_TOKENS = 40;

/**
 * A deliberately simple estimate (about four characters per token for English prose). It only sizes
 * chunks; nothing is billed by it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Span {
  start: number;
  end: number;
}

/** Boundaries tried in order when a piece of text is too long. */
const SEPARATORS = [/\n[ \t]*\n\s*/g, /\n/g, /(?<=[.!?;:])\s+/g, /\s+/g];

/** Splits [start, end) of `text` at matches of `separator`, keeping every character in some span. */
function splitAt(text: string, span: Span, separator: RegExp): Span[] {
  const spans: Span[] = [];
  const pattern = new RegExp(separator.source, 'g');
  const slice = text.slice(span.start, span.end);
  let cursor = 0;
  for (const match of slice.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > cursor) spans.push({ start: span.start + cursor, end: span.start + at });
    cursor = at + match[0].length;
  }
  if (cursor < slice.length) spans.push({ start: span.start + cursor, end: span.end });
  return spans;
}

/** Breaks text into units no larger than `maxChars`, preferring the coarsest boundary that works. */
function units(text: string, span: Span, maxChars: number, level = 0): Span[] {
  if (span.end - span.start <= maxChars) return [span];
  const separator = SEPARATORS[level];
  if (!separator) {
    // No boundary at all (e.g. a long URL or a run of symbols): cut hard.
    const pieces: Span[] = [];
    for (let at = span.start; at < span.end; at += maxChars)
      pieces.push({ start: at, end: Math.min(span.end, at + maxChars) });
    return pieces;
  }
  return splitAt(text, span, separator).flatMap((part) => units(text, part, maxChars, level + 1));
}

/** Narrows a span so that it neither starts nor ends with whitespace. */
function trimSpan(text: string, span: Span): Span | null {
  let { start, end } = span;
  while (start < end && /\s/.test(text[start] ?? '')) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end -= 1;
  return end > start ? { start, end } : null;
}

/** Packs units greedily into chunks, starting each chunk with the previous one's last units. */
export function chunkSpans(text: string, options: ChunkOptions = {}): Span[] {
  const maxChars = (options.maxTokens ?? DEFAULT_CHUNK_TOKENS) * 4;
  const overlapChars = (options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * 4;
  const whole = trimSpan(text, { start: 0, end: text.length });
  if (!whole) return [];
  const pieces = units(text, whole, maxChars)
    .map((unit) => trimSpan(text, unit))
    .filter((unit): unit is Span => unit !== null);

  const chunks: Span[] = [];
  let index = 0;
  while (index < pieces.length) {
    const first = pieces[index] as Span;
    let last = index;
    while (last + 1 < pieces.length && (pieces[last + 1] as Span).end - first.start <= maxChars) {
      last += 1;
    }
    chunks.push({ start: first.start, end: (pieces[last] as Span).end });
    if (last + 1 >= pieces.length) break;
    // Overlap: step back over trailing units that fit in the overlap budget, but always advance.
    let next = last + 1;
    while (
      next - 1 > index &&
      (pieces[last] as Span).end - (pieces[next - 1] as Span).start <= overlapChars
    ) {
      next -= 1;
    }
    index = next;
  }
  return chunks;
}

function count(text: string, needle: string): number {
  let total = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length))
    total += 1;
  return total;
}

/** The locator of a chunk that starts at `span.start` inside the section's text. */
function locate(locator: Locator, text: string, span: Span): Locator {
  switch (locator.kind) {
    case 'pdf':
      return { ...locator, charStart: span.start, charEnd: span.end };
    case 'docx':
      // DOCX sections join their paragraphs with a blank line (see the DOCX parser).
      return {
        ...locator,
        paragraph: locator.paragraph + count(text.slice(0, span.start), '\n\n'),
      };
    case 'text':
    case 'markdown':
      return { ...locator, line: locator.line + count(text.slice(0, span.start), '\n') };
    default:
      return locator;
  }
}

export function contextPrefixOf(documentTitle: string, section: NormalisedSection): string {
  const path =
    section.kind === 'heading' ? section.headingPath : [section.label, ...section.headingPath];
  return [documentTitle, ...path].filter((part) => part.trim() !== '').join(' › ');
}

export function chunkDocument(
  document: NormalisedDocument,
  documentTitle: string,
  options: ChunkOptions = {},
): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  document.sections.forEach((section, sectionIndex) => {
    const contextPrefix = contextPrefixOf(documentTitle, section);
    const add = (text: string, locator: Locator) => {
      for (const span of chunkSpans(text, options)) {
        const chunkText = text.slice(span.start, span.end);
        chunks.push({
          sectionIndex,
          ordinal: chunks.length,
          text: chunkText,
          contextPrefix,
          tokenEstimate: estimateTokens(chunkText),
          locator: locate(locator, text, span),
        });
      }
    };
    add(section.text, section.locator);
    if (section.notes && section.locator.kind === 'slides')
      add(section.notes, { ...section.locator, part: 'notes' });
  });
  return chunks;
}
