import { Document, isMap, parse, parseDocument, type YAMLMap } from 'yaml';

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
    // A created (not parsed) map uses block style: `id: …` rather than `{ id: … }`.
    const document = new Document({});
    for (const [key, value] of additions) document.set(key, value);
    const yaml = document.toString({ lineWidth: 0 }).replace(/\n/g, eol);
    const bom = text.startsWith(BOM) ? BOM : '';
    return `${bom}---${eol}${yaml}---${eol}${text.slice(bom.length)}`;
  }

  const parsed = parseDocument(split.yaml.replace(/\r\n/g, '\n'));
  if (parsed.errors.length > 0) {
    throw new FrontmatterEditError('The frontmatter is not valid YAML, so it was not changed.');
  }
  // Work with the general Document type: parsed documents type their nodes as read-only results.
  const document = parsed as unknown as Document;
  if (document.contents === null) document.contents = document.createNode({});
  if (!isMap(document.contents)) {
    throw new FrontmatterEditError(
      'The frontmatter is not a set of key: value pairs, so it was not changed.',
    );
  }
  const map = document.contents as YAMLMap<unknown, unknown>;
  for (const [key, value] of entries) {
    if (value === undefined) {
      document.delete(key);
    } else if (!document.has(key) && options.position === 'start') {
      map.items.unshift(document.createPair(key, value));
    } else {
      document.set(key, value);
    }
  }
  let yaml = document.toString({ lineWidth: 0 });
  if (map.items.length === 0) yaml = '';
  yaml = yaml.replace(/\n/g, eol);
  return text.slice(0, split.yamlStart) + yaml + text.slice(split.yamlEnd);
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
