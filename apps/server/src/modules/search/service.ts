import { readFileSync } from 'node:fs';
import {
  type Id,
  parseSearchQuery,
  type RecentItem,
  type SearchResponse,
  type TextPart,
  ValidationError,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import { decodeNote, type NoteIndexer } from '../notes/indexer';
import { COUNT_LIMIT, MATCH_END, MATCH_START, type SearchRepository } from './repository';

/**
 * Full-text search (tasks 4.01–4.03) and recently opened items (4.05). Ranking, snippets and
 * filtering happen in SQLite; this layer parses the user's query safely, shapes highlighted text as
 * parts (never HTML) and finds the first matching line so a result opens where the match is.
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
  return {
    search(query, { limit, offset }) {
      const started = performance.now();
      const parsed = parseSearchQuery(query);
      if (parsed.empty) {
        return {
          query,
          total: 0,
          totalCapped: false,
          offset,
          limit,
          results: [],
          highlights: [],
          tookMs: 0,
        };
      }
      let page: ReturnType<SearchRepository['searchNotes']>;
      try {
        page = repo.searchNotes({ ...parsed, limit, offset });
      } catch (error) {
        // The parser quotes every term, so this should be unreachable; never show an SQL error.
        logger.warn('A search query failed', { query, error });
        throw new ValidationError('That search could not be run. Try different words.');
      }
      const results = page.rows.map((row) => {
        let line: number | null = null;
        if (parsed.highlights.length > 0) {
          try {
            line = firstMatchingLine(
              decodeNote(readFileSync(indexer.absolute(row.path))).text,
              parsed.highlights,
            );
          } catch {
            line = null;
          }
        }
        const title = row.titleHighlight
          ? (row.titleHighlight.split('\n')[0] ?? row.title)
          : row.title;
        return {
          kind: 'note' as const,
          note: {
            id: asNoteId(row.id),
            path: row.path,
            title: row.title,
            type: row.type,
            updatedAt: row.updatedAt,
          },
          title: toParts(title),
          snippet: toParts((row.snippet ?? '').replace(/\s+/g, ' ').trim()),
          line,
        };
      });
      return {
        query,
        total: Math.min(page.total, COUNT_LIMIT),
        totalCapped: page.capped,
        offset,
        limit,
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
