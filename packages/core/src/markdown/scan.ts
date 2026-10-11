import GithubSlugger from 'github-slugger';
import { optionalString, parseFrontmatter, splitFrontmatter, stringList } from './frontmatter';

/**
 * Fast structural scanner for Obsidian-flavoured Markdown (knowledge-system.md §2). It does not build
 * a full syntax tree: it masks everything that is not prose (frontmatter, fenced code, inline code,
 * maths, comments) with spaces — preserving every offset and line break — and then extracts links,
 * tags and headings from what is left. Used by the server for indexing and by the editor for its
 * outline and completions, so both agree on what counts as a link.
 */

export interface NoteLinkRef {
  syntax: 'wikilink' | 'markdown';
  /** `![[…]]` or `![](…)`. */
  embed: boolean;
  /** Link target as written (decoded for Markdown links), without the `#heading` part. */
  target: string;
  heading: string | null;
  blockRef: string | null;
  /** Wikilink alias, or the text of a Markdown link. */
  alias: string | null;
  /** Exact source text of the whole link. */
  raw: string;
  offset: number;
  length: number;
  /**
   * Span of the target as written (before any `#fragment`; still percent-encoded for Markdown links),
   * so a rename can rewrite just the target and keep headings, aliases and titles.
   */
  targetOffset: number;
  targetLength: number;
  /** 1-based line and 0-based column of the link's first character. */
  line: number;
  column: number;
}

export interface HeadingRef {
  level: number;
  text: string;
  slug: string;
  line: number;
  offset: number;
}

export interface TagRef {
  /** As written, without the leading `#`. */
  tag: string;
  offset: number;
  line: number;
}

export interface NoteAnalysis {
  frontmatterPresent: boolean;
  frontmatter: Record<string, unknown>;
  frontmatterError: string | null;
  /** Offset where the body starts (after frontmatter). */
  bodyStart: number;
  id: string | null;
  title: string | null;
  type: string | null;
  module: string | null;
  lecture: string | null;
  created: string | null;
  aliases: string[];
  /** Unique lower-case tags from frontmatter and the body, sorted. */
  tags: string[];
  inlineTags: TagRef[];
  links: NoteLinkRef[];
  headings: HeadingRef[];
  wordCount: number;
  /** Body text for full-text search: markup stripped, code kept. */
  searchText: string;
}

// ---------------------------------------------------------------------------------------------
// Masking

function maskRange(chars: string[], start: number, end: number): void {
  for (let index = start; index < end && index < chars.length; index += 1) {
    const char = chars[index];
    if (char !== '\n' && char !== '\r') chars[index] = ' ';
  }
}

interface LineSpan {
  start: number;
  end: number;
  text: string;
}

function lineSpans(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length || text[index] === '\n') {
      const end = index;
      spans.push({ start, end, text: text.slice(start, end).replace(/\r$/, '') });
      start = index + 1;
    }
  }
  return spans;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function maskBlocks(text: string, chars: string[], from: number, maths = true): void {
  let fence: { char: string; length: number } | null = null;
  let inMath = false;
  for (const line of lineSpans(text)) {
    if (line.end <= from) continue;
    if (fence) {
      maskRange(chars, line.start, line.end);
      const close = new RegExp(
        `^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`,
      );
      if (close.test(line.text)) fence = null;
      continue;
    }
    if (inMath) {
      maskRange(chars, line.start, line.end);
      if (line.text.includes('$$')) inMath = false;
      continue;
    }
    const open = FENCE_OPEN.exec(line.text);
    if (open?.[1] && !(open[1].startsWith('`') && (open[2] ?? '').includes('`'))) {
      fence = { char: open[1][0] ?? '`', length: open[1].length };
      maskRange(chars, line.start, line.end);
      continue;
    }
    const trimmed = line.text.trimStart();
    if (maths && trimmed.startsWith('$$')) {
      maskRange(chars, line.start, line.end);
      // `$$ x $$` on one line is a complete block; otherwise mask until the closing `$$`.
      if (!trimmed.slice(2).includes('$$')) inMath = true;
    }
  }
}

/** Masks every `open … close` span in one scan (an unclosed `open` ends the search, see blankSpans). */
function maskSpans(chars: string[], text: string, open: string, close: string): void {
  let at = 0;
  for (;;) {
    const start = text.indexOf(open, at);
    if (start === -1) return;
    const end = text.indexOf(close, start + open.length);
    if (end === -1) return;
    maskRange(chars, start, end + close.length);
    at = end + close.length;
  }
}

function maskPattern(chars: string[], pattern: RegExp): void {
  const text = chars.join('');
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) maskRange(chars, match.index, match.index + match[0].length);
  }
}

function isBlankLineAfter(text: string, newlineIndex: number): boolean {
  const next = text.indexOf('\n', newlineIndex + 1);
  const line = text.slice(newlineIndex + 1, next === -1 ? text.length : next);
  return line.trim() === '';
}

/** CommonMark code spans: a run of n backticks closed by the next run of exactly n, within a paragraph. */
function maskCodeSpans(chars: string[]): void {
  const text = chars.join('');
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '`' || (index > 0 && text[index - 1] === '\\')) {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (text[runEnd] === '`') runEnd += 1;
    const length = runEnd - index;
    let cursor = runEnd;
    let closing = -1;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === '\n' && isBlankLineAfter(text, cursor)) break;
      if (char === '`') {
        let end = cursor;
        while (text[end] === '`') end += 1;
        if (end - cursor === length) {
          closing = cursor;
          break;
        }
        cursor = end;
        continue;
      }
      cursor += 1;
    }
    if (closing === -1) {
      index = runEnd;
    } else {
      maskRange(chars, index, closing + length);
      index = closing + length;
    }
  }
}

/**
 * Returns `text` with non-prose regions replaced by spaces (newlines kept), so offsets and line
 * numbers in the result match the original. `from` masks everything before it (the frontmatter).
 */
export function maskNonProse(text: string, from = 0): string {
  const chars = text.split('');
  maskRange(chars, 0, from);
  maskBlocks(text, chars, from);
  maskSpans(chars, chars.join(''), '<!--', '-->');
  maskSpans(chars, chars.join(''), '%%', '%%');
  maskCodeSpans(chars);
  maskPattern(chars, /(?<!\\)\$\$[^\n]*?\$\$/g);
  // Inline maths: $x$ with no space just inside the dollars and no digit after (so "$5 and $6" is text).
  maskPattern(chars, INLINE_MATH);
  return chars.join('');
}

/** Like `maskNonProse`, but masks only code (fenced blocks and code spans). */
export function maskCode(text: string, from = 0): string {
  const chars = text.split('');
  maskRange(chars, 0, from);
  maskBlocks(text, chars, from, false);
  maskCodeSpans(chars);
  return chars.join('');
}

/** Obsidian's inline maths: `$x$` with no space inside the dollars and no digit after the closing one. */
export const INLINE_MATH =
  /(?<![\\$])\$(?=[^\s$])[^$\n]*?[^\s\\$]\$(?![\d$])|(?<![\\$])\$[^\s$\\]\$(?![\d$])/g;

/**
 * Ranges of Obsidian comments (`%% … %%`, possibly over several lines) outside code, so a renderer
 * can leave them out without touching `%%` that appears inside code.
 */
export function obsidianCommentRanges(text: string, from = 0): { start: number; end: number }[] {
  const masked = maskCode(text, from);
  return [...masked.matchAll(/%%[\s\S]*?%%/g)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

// ---------------------------------------------------------------------------------------------
// Positions

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function positionOf(starts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - (starts[low] ?? 0) };
}

// ---------------------------------------------------------------------------------------------
// Extraction

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
// The text may hold one level of brackets (`[see [1]](…)`). Each step matches one way only, so a long
// run of `[` is read in linear time; "anything but `]`" rescanned the line from every `[` (task 21.03).
const MARKDOWN_LINK =
  /(!?)\[((?:[^\][\n]|\[[^\][\n]*\])*)\]\(\s*(<[^>\n]+>|[^\s()]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const TAG = /(?<=^|[\s([{,;:!?"'])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gmu;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

function splitFragment(linkPart: string): {
  target: string;
  heading: string | null;
  blockRef: string | null;
} {
  const hash = linkPart.indexOf('#');
  if (hash === -1) return { target: linkPart.trim(), heading: null, blockRef: null };
  const target = linkPart.slice(0, hash).trim();
  const fragment = linkPart.slice(hash + 1).trim();
  if (fragment.startsWith('^'))
    return { target, heading: null, blockRef: fragment.slice(1) || null };
  return { target, heading: fragment || null, blockRef: null };
}

/** Leading-whitespace-trimmed span of the text before the first `#` in `part`, relative to `part`. */
function targetSpan(part: string): { start: number; length: number } {
  const hash = part.indexOf('#');
  const head = hash === -1 ? part : part.slice(0, hash);
  const start = head.length - head.trimStart().length;
  return { start, length: head.trim().length };
}

function parseWikilinkInner(inner: string): { linkPart: string; alias: string | null } {
  // In tables Obsidian requires the alias pipe to be escaped as "\|".
  for (let index = 0; index < inner.length; index += 1) {
    if (inner[index] === '|') {
      const escaped = index > 0 && inner[index - 1] === '\\';
      const linkPart = inner.slice(0, escaped ? index - 1 : index);
      const alias = inner.slice(index + 1).trim();
      return { linkPart, alias: alias === '' ? null : alias };
    }
  }
  return { linkPart: inner, alias: null };
}

function extractLinks(masked: string, original: string, starts: number[]): NoteLinkRef[] {
  const links: NoteLinkRef[] = [];
  for (const match of masked.matchAll(WIKILINK)) {
    const offset = match.index ?? 0;
    const innerStart = offset + (match[1]?.length ?? 0) + 2;
    const inner = original.slice(innerStart, offset + match[0].length - 2);
    const { linkPart, alias } = parseWikilinkInner(inner);
    const { target, heading, blockRef } = splitFragment(linkPart);
    if (target === '' && heading === null && blockRef === null) continue;
    const span = targetSpan(linkPart);
    links.push({
      syntax: 'wikilink',
      embed: match[1] === '!',
      target,
      heading,
      blockRef,
      alias,
      raw: original.slice(offset, offset + match[0].length),
      offset,
      length: match[0].length,
      targetOffset: innerStart + span.start,
      targetLength: span.length,
      ...positionOf(starts, offset),
    });
  }
  for (const match of masked.matchAll(MARKDOWN_LINK)) {
    const offset = match.index ?? 0;
    let destination = match[3] ?? '';
    // The destination follows "[text](" and optional whitespace.
    let destinationStart =
      offset + match[0].indexOf(destination, (match[1]?.length ?? 0) + (match[2]?.length ?? 0) + 3);
    if (destination.startsWith('<') && destination.endsWith('>')) {
      destination = destination.slice(1, -1);
      destinationStart += 1;
    }
    if (URL_SCHEME.test(destination) || destination.startsWith('//') || destination.startsWith('#'))
      continue;
    let decoded = destination;
    try {
      decoded = decodeURI(destination);
    } catch {
      // Keep the raw destination when it is not valid percent-encoding.
    }
    const { target, heading, blockRef } = splitFragment(decoded);
    if (target === '') continue;
    const span = targetSpan(destination);
    links.push({
      syntax: 'markdown',
      embed: match[1] === '!',
      target,
      heading,
      blockRef,
      alias: (match[2] ?? '').trim() || null,
      raw: original.slice(offset, offset + match[0].length),
      offset,
      length: match[0].length,
      targetOffset: destinationStart + span.start,
      targetLength: span.length,
      ...positionOf(starts, offset),
    });
  }
  return links.sort((a, b) => a.offset - b.offset);
}

function extractInlineTags(masked: string, starts: number[]): TagRef[] {
  const tags: TagRef[] = [];
  for (const match of masked.matchAll(TAG)) {
    const tag = (match[1] ?? '').replace(/\/+$/, '');
    if (tag === '' || tag.startsWith('/')) continue;
    const offset = match.index ?? 0;
    tags.push({ tag, offset, line: positionOf(starts, offset).line });
  }
  return tags;
}

/** Heading text without inline markup, e.g. `**Paxos** and [[Raft|the Raft paper]]` → `Paxos and the Raft paper`. */
export function plainHeadingText(text: string): string {
  return text
    .replace(
      /!?\[\[([^\][|]*?)(?:\|([^\][]*))?\]\]/g,
      (_, target: string, alias?: string) => alias ?? target,
    )
    .replace(/!?\[((?:[^\][]|\[[^\][]*\])*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|==|~~|\*|_|`)/g, '')
    .trim();
}

function extractHeadings(masked: string, original: string): HeadingRef[] {
  const slugger = new GithubSlugger();
  const headings: HeadingRef[] = [];
  for (const line of lineSpans(masked)) {
    const match = HEADING.exec(line.text);
    if (!match?.[1]) continue;
    const originalLine = original.slice(line.start, line.end).replace(/\r$/, '');
    const originalMatch = HEADING.exec(originalLine);
    const text = plainHeadingText(originalMatch?.[2] ?? match[2] ?? '');
    if (text === '') continue;
    headings.push({
      level: match[1].length,
      text,
      slug: slugger.slug(text),
      line: 0,
      offset: line.start,
    });
  }
  return headings;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function countWords(masked: string, from: number): number {
  return masked.slice(from).match(WORD)?.length ?? 0;
}

/**
 * Replaces every `open … close` span with a space, scanning once: a lazy regular expression would
 * rescan to the end of the text from every unclosed `open`, which is quadratic (task 21.03).
 */
function blankSpans(text: string, open: string, close: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const start = text.indexOf(open, at);
    if (start === -1) break;
    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;
    out += `${text.slice(at, start)} `;
    at = end + close.length;
  }
  return out + text.slice(at);
}

/**
 * Text for full-text search: frontmatter removed, Markdown punctuation stripped, code kept. The link
 * patterns never cross `[` or a line break, so a long run of brackets is read in linear time.
 */
export function toSearchText(body: string): string {
  return blankSpans(blankSpans(body, '<!--', '-->'), '%%', '%%')
    .replace(
      /!?\[\[([^\][|#\n]*)(?:#([^\][|\n]*))?(?:\|([^\][\n]*))?\]\]/g,
      (_, target: string, heading?: string, alias?: string) =>
        [alias ?? target, heading].filter(Boolean).join(' '),
    )
    .replace(/!?\[((?:[^\][\n]|\[[^\][\n]*\])*)\]\([^)\n]*\)/g, '$1')
    .replace(/<[^<>\n]+>/g, ' ')
    .replace(/^ {0,3}(#{1,6}|>+(\s*\[![^\]]*\][+-]?)?)[ \t]*/gm, '')
    .replace(/(\*\*|__|==|~~)/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normaliseTag(tag: string): string {
  return tag.normalize('NFC').replace(/^#/, '').trim().toLowerCase();
}

/** Analyses a whole note file (frontmatter + body) in one pass. */
export function analyseNote(text: string): NoteAnalysis {
  const split = splitFrontmatter(text);
  const { data, error } = split.present ? parseFrontmatter(split.yaml) : { data: {}, error: null };
  const masked = maskNonProse(text, split.bodyStart);
  const starts = lineStarts(text);
  const headings = extractHeadings(masked, text).map((heading) => ({
    ...heading,
    line: positionOf(starts, heading.offset).line,
  }));
  const inlineTags = extractInlineTags(masked, starts);
  const frontmatterTags = stringList(data.tags ?? data.tag);
  const tags = [
    ...new Set([...frontmatterTags, ...inlineTags.map((ref) => ref.tag)].map(normaliseTag)),
  ]
    .filter((tag) => tag !== '')
    .sort();

  return {
    frontmatterPresent: split.present,
    frontmatter: data,
    frontmatterError: error,
    bodyStart: split.bodyStart,
    id: optionalString(data.id),
    title: optionalString(data.title),
    type: optionalString(data.type),
    module: optionalString(data.module),
    lecture: optionalString(data.lecture),
    created: optionalString(data.created),
    aliases: stringList(data.aliases ?? data.alias),
    tags,
    inlineTags,
    links: extractLinks(masked, text, starts),
    headings,
    wordCount: countWords(masked, split.bodyStart),
    searchText: toSearchText(text.slice(split.bodyStart)),
  };
}
