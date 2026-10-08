import { INLINE_MATH, maskCode, obsidianCommentRanges } from '@skb/core/markdown';

/**
 * Source-level preparation before Markdown parsing, for things the Markdown parser cannot see the
 * way Obsidian does:
 * - `%% comments %%` may span paragraphs, so they are removed here rather than in the syntax tree;
 * - a `$` that does not open Obsidian-style maths ("$5 and $6") is escaped, because remark-math
 *   would otherwise render "5 and " as a formula.
 * Code (fenced blocks and code spans) is never changed.
 */

export function removeComments(text: string): string {
  const ranges = obsidianCommentRanges(text);
  if (ranges.length === 0) return text;
  let result = '';
  let cursor = 0;
  for (const { start, end } of ranges) {
    result += text.slice(cursor, start);
    cursor = end;
  }
  return result + text.slice(cursor);
}

export function escapeStrayDollars(text: string): string {
  if (!text.includes('$')) return text;
  const masked = maskCode(text);
  const inMaths = new Uint8Array(text.length);
  const mark = (start: number, end: number) => inMaths.fill(1, start, end);
  // Display maths first ($$ … $$, possibly over several lines), then inline maths in what is left.
  for (const match of masked.matchAll(/\$\$[\s\S]*?\$\$/g))
    mark(match.index ?? 0, (match.index ?? 0) + match[0].length);
  const remaining = masked.replace(/\$\$[\s\S]*?\$\$/g, (block) => ' '.repeat(block.length));
  for (const match of remaining.matchAll(INLINE_MATH))
    mark(match.index ?? 0, (match.index ?? 0) + match[0].length);

  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '$' && masked[index] === '$' && !inMaths[index] && text[index - 1] !== '\\')
      result += '\\';
    result += char;
  }
  return result;
}

export function prepareMarkdown(text: string): string {
  return escapeStrayDollars(removeComments(text));
}
