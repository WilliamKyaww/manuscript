import { isMap, isNode, isScalar, parse, parseDocument, stringify } from 'yaml';

/**
 * YAML frontmatter: splitting, lenient parsing and comment-preserving edits (data-model.md §3).
 * Only the application-owned `id` key is ever added automatically; edits keep the user's comments,
 * key order, quoting and line endings.
 */

export interface FrontmatterSplit {
  /** True when the text starts with a `---` block that is closed by `---` or `...`. */
  present: boolean;
  /** The YAML between the delimiters (empty when absent). */
  yaml: string;
  /** Offsets of `yaml` within the full text (both 0 when absent). */
  yamlStart: number;
  yamlEnd: number;
  /** Offset where the body starts (after the closing delimiter line). */
  bodyStart: number;
  /** Number of lines occupied by the frontmatter including delimiters (0 when absent). */
  lineCount: number;
}

const BOM = '﻿';
const OPEN = /^---[ \t]*\r?\n/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;

export function splitFrontmatter(text: string): FrontmatterSplit {
  const offset = text.startsWith(BOM) ? 1 : 0;
  const head = text.slice(offset);
  const open = OPEN.exec(head);
  const absent: FrontmatterSplit = {
    present: false,
    yaml: '',
    yamlStart: 0,
    yamlEnd: 0,
    bodyStart: 0,
    lineCount: 0,
  };
  if (!open) return absent;

  const yamlStart = offset + open[0].length;
  const rest = text.slice(yamlStart);
  // Find a closing delimiter at the start of a line (including an empty frontmatter block).
  let closeIndex = -1;
  let closeLength = 0;
  const pattern = new RegExp(CLOSE.source, 'gm');
  for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
    if (match.index === 0 || rest[match.index - 1] === '\n') {
      closeIndex = match.index;
      closeLength = match[0].length;
      break;
    }
  }
  if (closeIndex === -1) return absent;

  const yamlEnd = yamlStart + closeIndex;
  const bodyStart = yamlEnd + closeLength;
  const prefix = text.slice(0, bodyStart);
  const lineCount = (prefix.match(/\n/g)?.length ?? 0) + (prefix.endsWith('\n') ? 0 : 1);
  return {
    present: true,
    yaml: text.slice(yamlStart, yamlEnd),
    yamlStart,
    yamlEnd,
    bodyStart,
    lineCount,
  };
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  /** Human-readable problem, when the YAML is invalid or not a mapping. */
  error: string | null;
}

/** Parses frontmatter leniently: invalid YAML yields an error message and empty data, never a throw. */
export function parseFrontmatter(yaml: string): ParsedFrontmatter {
  if (yaml.trim() === '') return { data: {}, error: null };
  try {
    const value: unknown = parse(yaml, { prettyErrors: false });
    if (value === null || value === undefined) return { data: {}, error: null };
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { data: {}, error: 'Frontmatter must be a set of key: value pairs.' };
    }
    return { data: value as Record<string, unknown>, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { data: {}, error: `Frontmatter is not valid YAML: ${message}` };
  }
}

export class FrontmatterEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontmatterEditError';
  }
}

export interface FrontmatterEditOptions {
  /** Where to insert keys that do not exist yet (default: end). */
  position?: 'start' | 'end';
}

/** The line ending of the first line, i.e. of the frontmatter block (files can mix styles). */
function detectEol(text: string): '\r\n' | '\n' {
  const index = text.indexOf('\n');
  return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * Sets (or, with `undefined`, removes) frontmatter keys while preserving everything else.
 * Creates a frontmatter block when there is none. Refuses to edit invalid YAML rather than risk
 * corrupting it.
 */
export function setFrontmatterValues(
  text: string,
  updates: Readonly<Record<string, unknown>>,
  options: FrontmatterEditOptions = {},
): string {
  const eol = detectEol(text);
  const split = splitFrontmatter(text);
  const entries = Object.entries(updates);

  if (!split.present) {
    const additions = entries.filter(([, value]) => value !== undefined);
    if (additions.length === 0) return text;
    const yaml = additions.map(([key, value]) => `${serialisePair(key, value)}${eol}`).join('');
    const bom = text.startsWith(BOM) ? BOM : '';
    return `${bom}---${eol}${yaml}---${eol}${text.slice(bom.length)}`;
  }

  // Edits are made on an LF copy and converted back, so offsets are simple.
  const source = split.yaml.replace(/\r\n/g, '\n');
  const parsed = parseDocument(source);
  if (parsed.errors.length > 0) {
    throw new FrontmatterEditError('The frontmatter is not valid YAML, so it was not changed.');
  }
  const contents = parsed.contents;
  if (contents !== null && (!isMap(contents) || contents.flow)) {
    throw new FrontmatterEditError(
      'The frontmatter is not a list of key: value lines, so it was not changed.',
    );
  }
  const pairs = contents && isMap(contents) ? contents.items : [];

  // Minimal text edits: only the lines of the keys being changed are touched, so the rest of the
  // YAML keeps its exact formatting (quotes, flow lists, indentation, comments).
  const edits: { offset: number; length: number; text: string }[] = [];
  const atStart: string[] = [];
  const atEnd: string[] = [];
  for (const [key, value] of entries) {
    const pair = pairs.find((item) => isScalar(item.key) && item.key.value === key);
    const keyRange = pair && isScalar(pair.key) ? pair.key.range : undefined;
    const valueRange = pair && isNode(pair.value) ? pair.value.range : undefined;
    if (value === undefined) {
      if (!keyRange) continue;
      const start = source.lastIndexOf('\n', keyRange[0] - 1) + 1;
      const nodeEnd = valueRange?.[2] ?? keyRange[2];
      const lineEnd = source.indexOf('\n', Math.max(nodeEnd - 1, start));
      edits.push({
        offset: start,
        length: (lineEnd === -1 ? source.length : lineEnd + 1) - start,
        text: '',
      });
    } else if (keyRange) {
      const end = valueRange?.[1] ?? keyRange[1];
      const keepNewline = source[end - 1] === '\n';
      edits.push({
        offset: keyRange[0],
        length: end - keyRange[0],
        text: serialisePair(key, value) + (keepNewline ? '\n' : ''),
      });
    } else {
      (options.position === 'start' ? atStart : atEnd).push(`${serialisePair(key, value)}\n`);
    }
  }
  if (atStart.length > 0) edits.push({ offset: 0, length: 0, text: atStart.join('') });
  if (atEnd.length > 0) {
    const separator = source === '' || source.endsWith('\n') ? '' : '\n';
    edits.push({ offset: source.length, length: 0, text: separator + atEnd.join('') });
  }

  let yaml = source;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    yaml = yaml.slice(0, edit.offset) + edit.text + yaml.slice(edit.offset + edit.length);
  }
  if (parseDocument(yaml).errors.length > 0) {
    throw new FrontmatterEditError(
      'That change would make the frontmatter invalid, so it was not made.',
    );
  }
  return text.slice(0, split.yamlStart) + yaml.replace(/\n/g, eol) + text.slice(split.yamlEnd);
}

/** One top-level `key: value` entry in YAML block style, without a trailing newline. */
function serialisePair(key: string, value: unknown): string {
  return stringify({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, '');
}

/** Reads a string or list-of-strings property (e.g. `tags: [a, b]`, `tags: a, b`, or a YAML list). */
export function stringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' || typeof item === 'number' ? [String(item)] : [],
    );
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  }
  if (typeof value === 'number') return [String(value)];
  return [];
}

export function optionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}
