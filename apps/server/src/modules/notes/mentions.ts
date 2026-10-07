import { analyseNote, maskNonProse, normaliseKey } from '@skb/core/markdown';

/**
 * Unlinked mentions (task 3.12): plain-text occurrences of a note's name, title or aliases in another
 * note's prose — not in code, maths, comments, frontmatter, or an existing link.
 */

export interface MentionMatch {
  offset: number;
  length: number;
  line: number;
  /** The text as written. */
  text: string;
  /** The line containing the mention, trimmed for display. */
  context: string;
}

const MAX_CONTEXT = 240;
const LETTER_OR_DIGIT = /[\p{L}\p{N}_]/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Phrases worth searching for: unique, at least two characters, longest first. */
export function mentionPhrases(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const name of names) {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const key = normaliseKey(trimmed);
    if (trimmed.length < 2 || seen.has(key)) continue;
    seen.add(key);
    phrases.push(trimmed);
  }
  return phrases.sort((a, b) => b.length - a.length);
}

function lineOf(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((lineStarts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

export function findMentions(text: string, names: readonly string[]): MentionMatch[] {
  const phrases = mentionPhrases(names);
  if (phrases.length === 0) return [];
  const analysis = analyseNote(text);
  const chars = maskNonProse(text, analysis.bodyStart).split('');
  // Existing links are not mentions.
  for (const link of analysis.links) {
    for (let index = link.offset; index < link.offset + link.length; index += 1) {
      if (chars[index] !== '\n') chars[index] = ' ';
    }
  }
  const masked = chars.join('');

  // Match composed and decomposed spellings without normalising (and so moving) the text itself.
  const variants = new Set(
    phrases.flatMap((phrase) => [phrase.normalize('NFC'), phrase.normalize('NFD')]),
  );
  const pattern = new RegExp(
    [...variants].map((phrase) => escapeRegExp(phrase).replace(/ /g, '\\s+')).join('|'),
    'giu',
  );
  const lines = text.split('\n');
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1)
    if (text[index] === '\n') lineStarts.push(index + 1);

  const matches: MentionMatch[] = [];
  for (const match of masked.matchAll(pattern)) {
    const offset = match.index ?? 0;
    const length = match[0].length;
    if (
      LETTER_OR_DIGIT.test(masked[offset - 1] ?? '') ||
      LETTER_OR_DIGIT.test(masked[offset + length] ?? '')
    ) {
      continue;
    }
    const line = lineOf(lineStarts, offset);
    const context = (lines[line - 1] ?? '').replace(/\r$/, '').trim();
    matches.push({
      offset,
      length,
      line,
      text: text.slice(offset, offset + length),
      context: context.length > MAX_CONTEXT ? `${context.slice(0, MAX_CONTEXT - 1)}…` : context,
    });
  }
  return matches;
}
