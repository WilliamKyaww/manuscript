/**
 * Search query syntax (knowledge-system.md §4, task 4.01) → a safe SQLite FTS5 expression plus filters.
 *
 *   word            notes containing a word starting with "word" (prefix match)
 *   "two words"     the exact phrase
 *   a OR b          either term
 *   -word, -"x y"   exclude notes containing it
 *   tag:exam        notes tagged exam or exam/… (also #exam)
 *   type:summary    frontmatter type
 *   folder:COC251   notes in that folder or below (quote names with spaces: folder:"Week 1")
 *   module:COC251   frontmatter module (sources: their module folder)
 *   kind:note       only notes; kind:source only sources; kind:pdf|slides|docx|text one source kind
 *   -tag:draft …    any filter can be negated
 *
 * Every term reaches FTS5 as a quoted string, so no input can produce an FTS5 syntax error or use
 * FTS5 operators the user did not mean; text without letters or digits is ignored.
 */

export type FilterKey = 'tag' | 'type' | 'folder' | 'module' | 'kind';
export const FILTER_KEYS: readonly FilterKey[] = ['tag', 'type', 'folder', 'module', 'kind'];

/** Values of the `kind:` filter after normalisation. */
export const RESULT_KINDS = [
  'note',
  'source',
  'pdf',
  'slides',
  'docx',
  'text',
  'recording',
  'image',
] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

/** Spellings people are likely to type for each kind. */
const KIND_SYNONYMS: Readonly<Record<string, ResultKind>> = {
  note: 'note',
  notes: 'note',
  source: 'source',
  sources: 'source',
  pdf: 'pdf',
  pdfs: 'pdf',
  slides: 'slides',
  slide: 'slides',
  pptx: 'slides',
  docx: 'docx',
  word: 'docx',
  document: 'docx',
  text: 'text',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  recording: 'recording',
  recordings: 'recording',
  audio: 'recording',
  video: 'recording',
  image: 'image',
  images: 'image',
};

export interface SearchFilters {
  tag: string[];
  type: string[];
  folder: string[];
  module: string[];
  kind: string[];
}

export interface QueryTerm {
  text: string;
  phrase: boolean;
}

export interface ParsedQuery {
  /** Positive terms, grouped: terms in one group are alternatives (OR), groups are all required. */
  groups: QueryTerm[][];
  excluded: QueryTerm[];
  filters: SearchFilters;
  excludedFilters: SearchFilters;
  /** FTS5 expression for the positive terms, or null when there are none. */
  match: string | null;
  /** FTS5 expression matching any excluded term, or null. */
  exclude: string | null;
  /** Lower-case words and phrases to highlight or locate in a note. */
  highlights: string[];
  /** True when nothing at all was asked for. */
  empty: boolean;
}

export const MAX_QUERY_LENGTH = 500;
const MAX_TERMS = 32;
const SEARCHABLE = /[\p{L}\p{N}]/u;

function emptyFilters(): SearchFilters {
  return { tag: [], type: [], folder: [], module: [], kind: [] };
}

interface Token {
  negated: boolean;
  key: FilterKey | null;
  value: string;
  quoted: boolean;
}

/** Splits the input into tokens, tolerating unbalanced quotes and stray punctuation. */
function tokenise(input: string): Token[] {
  const text = input.slice(0, MAX_QUERY_LENGTH);
  const tokens: Token[] = [];
  let index = 0;
  const readValue = (): { value: string; quoted: boolean } => {
    if (text[index] === '"') {
      const close = text.indexOf('"', index + 1);
      const end = close === -1 ? text.length : close;
      const value = text.slice(index + 1, end);
      index = close === -1 ? text.length : close + 1;
      return { value, quoted: true };
    }
    const start = index;
    while (index < text.length && !/\s/.test(text[index] ?? '')) index += 1;
    return { value: text.slice(start, index), quoted: false };
  };
  while (index < text.length) {
    if (/\s/.test(text[index] ?? '')) {
      index += 1;
      continue;
    }
    let negated = false;
    if (text[index] === '-' && index + 1 < text.length && !/\s/.test(text[index + 1] ?? '')) {
      negated = true;
      index += 1;
    }
    const keyMatch = /^(tag|type|folder|module|kind):/i.exec(text.slice(index));
    let key: FilterKey | null = null;
    if (keyMatch?.[1]) {
      key = keyMatch[1].toLowerCase() as FilterKey;
      index += keyMatch[0].length;
    }
    const { value, quoted } = readValue();
    if (!key && !quoted && value.startsWith('#') && value.length > 1) {
      tokens.push({ negated, key: 'tag', value: value.slice(1), quoted: false });
    } else {
      tokens.push({ negated, key, value, quoted });
    }
  }
  return tokens;
}

function normaliseFilter(key: FilterKey, value: string): string | null {
  let cleaned = value.normalize('NFC').trim();
  if (key === 'tag') cleaned = cleaned.replace(/^#/, '').toLowerCase();
  if (key === 'folder') cleaned = cleaned.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  // Unknown kinds are kept as typed (lower case): they match nothing rather than everything.
  if (key === 'kind') cleaned = KIND_SYNONYMS[cleaned.toLowerCase()] ?? cleaned.toLowerCase();
  return cleaned === '' ? null : cleaned;
}

/** An FTS5 string literal; non-phrases match as prefixes. */
function ftsTerm(term: QueryTerm): string {
  const literal = `"${term.text.replace(/"/g, '""')}"`;
  return term.phrase ? literal : `${literal}*`;
}

export function parseSearchQuery(input: string): ParsedQuery {
  const groups: QueryTerm[][] = [];
  const excluded: QueryTerm[] = [];
  const filters = emptyFilters();
  const excludedFilters = emptyFilters();
  let joinNext = false;
  let termCount = 0;

  for (const token of tokenise(input)) {
    if (token.key) {
      const value = normaliseFilter(token.key, token.value);
      if (value === null) continue;
      const target = token.negated ? excludedFilters : filters;
      if (!target[token.key].includes(value)) target[token.key].push(value);
      joinNext = false;
      continue;
    }
    if (!token.quoted && !token.negated && token.value === 'OR') {
      joinNext = groups.length > 0;
      continue;
    }
    const text = token.value.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!SEARCHABLE.test(text) || termCount >= MAX_TERMS) continue;
    termCount += 1;
    const term: QueryTerm = { text, phrase: token.quoted };
    if (token.negated) {
      excluded.push(term);
    } else if (joinNext) {
      groups.at(-1)?.push(term);
    } else {
      groups.push([term]);
    }
    joinNext = false;
  }

  const match =
    groups.length === 0
      ? null
      : groups
          .map((group) =>
            group.length === 1
              ? ftsTerm(group[0] as QueryTerm)
              : `(${group.map(ftsTerm).join(' OR ')})`,
          )
          .join(' AND ');
  const exclude = excluded.length === 0 ? null : excluded.map(ftsTerm).join(' OR ');
  const highlights = [...new Set(groups.flat().map((term) => term.text.toLowerCase()))];
  const hasFilters = FILTER_KEYS.some(
    (key) => filters[key].length > 0 || excludedFilters[key].length > 0,
  );
  return {
    groups,
    excluded,
    filters,
    excludedFilters,
    match,
    exclude,
    highlights,
    empty: groups.length === 0 && excluded.length === 0 && !hasFilters,
  };
}

/** Removes every `key:value` (or `-key:value`, or `#value` for tags) from a query string. */
export function withoutFilter(query: string, key: FilterKey, value: string): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = [`-?${key}:(?:"${escaped}/?"|${escaped}/?)`];
  if (key === 'tag') forms.push(`-?#${escaped}`);
  const pattern = new RegExp(`(^|\\s)(?:${forms.join('|')})(?=\\s|$)`, 'gi');
  return query.replace(pattern, '').replace(/\s+/g, ' ').trim();
}

/** Adds `key:value` to a query string unless it is already there (used by filter controls). */
export function withFilter(query: string, key: FilterKey, value: string): string {
  const token = /\s/.test(value) ? `${key}:"${value}"` : `${key}:${value}`;
  const parsed = parseSearchQuery(query);
  const normalised = normaliseFilter(key, value);
  if (normalised !== null && parsed.filters[key].includes(normalised)) return query;
  return query.trim() === '' ? token : `${query.trim()} ${token}`;
}
