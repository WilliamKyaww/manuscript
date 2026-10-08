import { readFileSync } from 'node:fs';
import {
  type Id,
  IMPORTABLE_SOURCE_KINDS,
  LocatorSchema,
  type ParsedQuery,
  parseSearchQuery,
  type RecentItem,
  type SearchResponse,
  type SearchResult,
  type SourceKind,
  type TextPart,
  ValidationError,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import { decodeNote, type NoteIndexer } from '../notes/indexer';
import {
  COUNT_LIMIT,
  MATCH_END,
  MATCH_START,
  type SearchRepository,
  type SearchScope,
} from './repository';

/**
 * Full-text search over notes (tasks 4.01–4.03) and source passages (5.16), and recently opened
 * items (4.05). Ranking, snippets and filtering happen in SQLite; this layer parses the user's
 * query safely, decides which kinds of result a query can return, shapes highlighted text as parts
 * (never HTML) and finds the first matching line so a note opens where the match is.
 */

export interface SearchService {
  search(query: string, page: { limit: number; offset: number }): SearchResponse;
  recordRecent(kind: 'note', id: string): void;
  recent(limit: number): RecentItem[];
}

export interface SearchServiceDependencies {
  repo: SearchRepository;
  indexer: NoteIndexer;
  clock: Clock;
  logger: Logger;
}

const RECENT_KEPT = 100;
const asNoteId = (value: string) => value as Id<'note'>;

/** Source kinds selected by each `kind:` filter value (core's RESULT_KINDS). */
const SOURCE_KINDS_FOR: Readonly<Record<string, readonly SourceKind[]>> = {
  source: IMPORTABLE_SOURCE_KINDS,
  pdf: ['pdf'],
  slides: ['pptx'],
  docx: ['docx'],
  text: ['markdown', 'text'],
};

/**
 * Which kinds of result a query can return. Tags and note types belong to notes, so filtering by
 * them leaves sources out; folders and modules apply to both.
 */
export function searchScope(parsed: Pick<ParsedQuery, 'filters' | 'excludedFilters'>): SearchScope {
  const { filters, excludedFilters } = parsed;
  let notes = true;
  let kinds = new Set<SourceKind>(IMPORTABLE_SOURCE_KINDS);
  if (filters.kind.length > 0) {
    notes = filters.kind.includes('note');
    kinds = new Set(filters.kind.flatMap((kind) => SOURCE_KINDS_FOR[kind] ?? []));
  }
  for (const kind of excludedFilters.kind) {
    if (kind === 'note') notes = false;
    for (const sourceKind of SOURCE_KINDS_FOR[kind] ?? []) kinds.delete(sourceKind);
  }
  if (filters.tag.length > 0 || filters.type.length > 0) kinds.clear();
  return { notes, sourceKinds: [...kinds] };
}

/** Splits text containing match markers into parts. */
export function toParts(marked: string): TextPart[] {
  const parts: TextPart[] = [];
  let match = false;
  let current = '';
  for (const char of marked) {
    if (char === MATCH_START || char === MATCH_END) {
      if (current) parts.push({ text: current, match });
      current = '';
      match = char === MATCH_START;
      continue;
    }
    current += char;
  }
  if (current) parts.push({ text: current, match });
  return parts;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** 1-based number of the first line where a term starts a word, or null. */
export function firstMatchingLine(text: string, terms: readonly string[]): number | null {
  if (terms.length === 0) return null;
  const patterns = terms.map(
    (term) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(fold(term)).replace(/ /g, '\\s+')}`, 'u'),
  );
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = fold(lines[index] ?? '');
    if (patterns.some((pattern) => pattern.test(line))) return index + 1;
  }
  return null;
}

export function createSearchService({
  repo,
  indexer,
  clock,
  logger,
}: SearchServiceDependencies): SearchService {
  const lineOf = (notePath: string, highlights: readonly string[]): number | null => {
    if (highlights.length === 0) return null;
    try {
      return firstMatchingLine(
        decodeNote(readFileSync(indexer.absolute(notePath))).text,
        highlights,
      );
    } catch {
      return null;
    }
  };

  return {
    search(query, { limit, offset }) {
      const started = performance.now();
      const parsed = parseSearchQuery(query);
      const empty: SearchResponse = {
        query,
        total: 0,
        totalCapped: false,
        offset,
        limit,
        results: [],
        highlights: [],
        tookMs: 0,
      };
      if (parsed.empty) return empty;
      const scope = searchScope(parsed);

      let results: SearchResult[];
      let page: ReturnType<SearchRepository['search']>;
      try {
        page = repo.search({ ...parsed, scope, limit, offset });
        const notes = repo.noteHits(
          parsed.match,
          page.hits.filter((hit) => hit.kind === 'note').map((hit) => hit.key),
        );
        const sources = repo.sourceHits(
          parsed.match,
          page.hits.filter((hit) => hit.kind === 'source').map((hit) => hit.key),
        );
        results = page.hits.flatMap((hit): SearchResult[] => {
          if (hit.kind === 'note') {
            const row = notes.get(hit.key);
            if (!row) return [];
            const title = row.titleHighlight
              ? (row.titleHighlight.split('\n')[0] ?? row.title)
              : row.title;
            return [
              {
                kind: 'note',
                note: {
                  id: asNoteId(row.id),
                  path: row.path,
                  title: row.title,
                  type: row.type,
                  updatedAt: row.updatedAt,
                },
                title: toParts(title),
                snippet: toParts(oneLine(row.snippet ?? '')),
                line: lineOf(row.path, parsed.highlights),
              },
            ];
          }
          const row = sources.get(hit.key);
          const locator = row ? LocatorSchema.safeParse(JSON.parse(row.locatorJson)) : null;
          if (!row || !locator?.success) return [];
          return [
            {
              kind: 'source',
              source: {
                id: row.sourceId as Id<'source'>,
                title: row.sourceTitle,
                kind: row.sourceKind,
                path: row.sourcePath,
              },
              section: { ordinal: row.sectionOrdinal, label: row.sectionLabel },
              locator: locator.data,
              title: toParts(row.titleHighlight),
              snippet: toParts(oneLine(row.snippet)),
            },
          ];
        });
      } catch (error) {
        // The parser quotes every term, so this should be unreachable; never show an SQL error.
        logger.warn('A search query failed', { query, error });
        throw new ValidationError('That search could not be run. Try different words.');
      }
      return {
        ...empty,
        total: Math.min(page.total, COUNT_LIMIT),
        totalCapped: page.capped,
        results,
        highlights: parsed.highlights,
        tookMs: Math.round((performance.now() - started) * 10) / 10,
      };
    },

    recordRecent(kind, id) {
      repo.recordRecent(kind, id, clock.now().toISOString(), RECENT_KEPT);
    },

    recent(limit) {
      return repo.recentNotes(limit).map((item) => ({
        kind: 'note' as const,
        note: { id: asNoteId(item.id), path: item.path, title: item.title },
        openedAt: item.openedAt,
      }));
    },
  };
}
