import type { SearchFilters, SourceKind } from '@skb/core';
import type { SqlDatabase, SqlValue } from '../../db/sqlite';

/**
 * SQL for full-text search over notes (`notes_fts`, migration 0002) and source passages
 * (`chunks_fts`, 0005), and for recent items (0003). Search runs in two steps: one query ranks and
 * pages the hits of both kinds together (BM25 ranks from the two indexes are on the same scale), then
 * highlights and snippets are computed only for the page being shown.
 */

/** Snippet markers: control characters that cannot occur in indexed text. */
export const MATCH_START = '\u0002';
export const MATCH_END = '\u0003';

/** Matches are counted up to this many; beyond it the total is reported as "more than". */
export const COUNT_LIMIT = 1000;

/** What a query may return: notes, and sources of these kinds (none when empty). */
export interface SearchScope {
  notes: boolean;
  sourceKinds: readonly SourceKind[];
}

export interface SearchQuery {
  match: string | null;
  exclude: string | null;
  filters: SearchFilters;
  excludedFilters: SearchFilters;
  scope: SearchScope;
  limit: number;
  offset: number;
}

/** A ranked hit: a note (by doc id) or a source passage (by chunk id). */
export interface SearchHit {
  kind: 'note' | 'source';
  key: number;
}

export interface NoteHitRow {
  docId: number;
  id: string;
  path: string;
  title: string;
  type: string | null;
  updatedAt: string;
  titleHighlight: string | null;
  snippet: string | null;
}

export interface SourceHitRow {
  chunkId: number;
  locatorJson: string;
  sectionOrdinal: number;
  sectionLabel: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  sourcePath: string;
  titleHighlight: string;
  snippet: string;
}

interface Clauses {
  sql: string[];
  params: SqlValue[];
}

/** Note filters. Several tags must all apply; several types, folders or modules are alternatives. */
function noteClauses(filters: SearchFilters, negate: boolean, into: Clauses): void {
  const not = negate ? 'NOT ' : '';
  for (const tag of filters.tag) {
    // The tag itself or any nested tag: a range ("tag/" < t < "tag0") so the index is used.
    into.sql.push(
      `n.doc_id ${not}IN (SELECT doc_id FROM note_tags WHERE tag = ? OR (tag > ? AND tag < ?))`,
    );
    into.params.push(tag, `${tag}/`, `${tag}0`);
  }
  anyOf(into, not, filters.type, "lower(coalesce(n.type, '')) = lower(?)", (value) => [value]);
  anyOf(into, not, filters.module, "lower(coalesce(n.module_code, '')) = lower(?)", (value) => [
    value,
  ]);
  anyOf(into, not, filters.folder, 'lower(substr(n.path, 1, ?)) = lower(?)', folderParams);
}

/** Source filters: folders and modules apply; tags and types never match a source (see the service). */
function sourceClauses(filters: SearchFilters, negate: boolean, into: Clauses): void {
  const not = negate ? 'NOT ' : '';
  anyOf(into, not, filters.module, "lower(coalesce(s.module_code, '')) = lower(?)", (value) => [
    value,
  ]);
  anyOf(into, not, filters.folder, 'lower(substr(s.path, 1, ?)) = lower(?)', folderParams);
}

function folderParams(value: string): SqlValue[] {
  return [value.length + 1, `${value}/`];
}

function anyOf(
  into: Clauses,
  not: string,
  values: readonly string[],
  clause: string,
  toParams: (value: string) => SqlValue[],
): void {
  if (values.length === 0) return;
  into.sql.push(`${not}(${values.map(() => clause).join(' OR ')})`);
  for (const value of values) into.params.push(...toParams(value));
}

const and = (clauses: Clauses) =>
  clauses.sql.length > 0 ? ` AND ${clauses.sql.join(' AND ')}` : '';

type Raw = Record<string, unknown>;

export type SearchRepository = ReturnType<typeof createSearchRepository>;

export function createSearchRepository(db: SqlDatabase) {
  /** The note and source parts of a query, each a SELECT of (kind, key, sort, tiebreak). */
  const parts = (query: SearchQuery) => {
    const note: Clauses = { sql: [], params: [] };
    noteClauses(query.filters, false, note);
    noteClauses(query.excludedFilters, true, note);
    if (query.exclude) {
      note.sql.push('n.doc_id NOT IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)');
      note.params.push(query.exclude);
    }
    const source: Clauses = {
      sql: [
        's.deleted_at IS NULL',
        's.missing_at IS NULL',
        `s.kind IN (${query.scope.sourceKinds.map(() => '?').join(', ')})`,
      ],
      params: [...query.scope.sourceKinds],
    };
    sourceClauses(query.filters, false, source);
    sourceClauses(query.excludedFilters, true, source);
    if (query.exclude) {
      source.sql.push('c.id NOT IN (SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?)');
      source.params.push(query.exclude);
    }

    const selects: { sql: string; params: SqlValue[] }[] = [];
    if (query.match) {
      // CROSS JOIN keeps the full-text index as the outer loop (SQLite's join-order hint): one
      // MATCH, then cheap per-row filter checks.
      if (query.scope.notes) {
        selects.push({
          sql: `SELECT 'note' AS kind, n.doc_id AS key, notes_fts.rank AS sort, n.path AS tiebreak
                FROM notes_fts CROSS JOIN notes n ON n.doc_id = notes_fts.rowid
                WHERE notes_fts MATCH ?${and(note)}`,
          params: [query.match, ...note.params],
        });
      }
      if (query.scope.sourceKinds.length > 0) {
        // One hit per page, slide or section: its best-ranked chunk (SQLite returns the other
        // columns from the row where min() was found).
        selects.push({
          sql: `SELECT 'source' AS kind, c.id AS key, min(chunks_fts.rank) AS sort, s.path AS tiebreak
                FROM chunks_fts CROSS JOIN chunks c ON c.id = chunks_fts.rowid
                JOIN sources s ON s.id = c.owner_id
                WHERE chunks_fts MATCH ? AND c.owner_type = 'source'${and(source)}
                GROUP BY c.section_id`,
          params: [query.match, ...source.params],
        });
      }
      return { selects, order: 'sort, tiebreak, kind, key' };
    }
    // Filters only: newest first; a source is represented by its first passage.
    if (query.scope.notes) {
      selects.push({
        sql: `SELECT 'note' AS kind, n.doc_id AS key, n.updated_at AS sort, n.path AS tiebreak
              FROM notes n WHERE 1 = 1${and(note)}`,
        params: note.params,
      });
    }
    if (query.scope.sourceKinds.length > 0) {
      selects.push({
        sql: `SELECT 'source' AS kind, c.id AS key, s.created_at AS sort, s.path AS tiebreak
              FROM sources s JOIN chunks c ON c.owner_type = 'source' AND c.owner_id = s.id AND c.ordinal = 0
              WHERE 1 = 1${and(source)}`,
        params: source.params,
      });
    }
    return { selects, order: 'sort DESC, tiebreak, kind, key' };
  };

  return {
    /** One page of ranked hits and the number of hits (capped just above COUNT_LIMIT). */
    search(query: SearchQuery): { hits: SearchHit[]; total: number; capped: boolean } {
      const { selects, order } = parts(query);
      if (selects.length === 0) return { hits: [], total: 0, capped: false };
      let total = 0;
      for (const select of selects) {
        total += Number(
          db.get<{ total: number }>(
            `SELECT count(*) AS total FROM (${select.sql} LIMIT ${COUNT_LIMIT + 1})`,
            select.params,
          )?.total ?? 0,
        );
      }
      const union = selects.map((select) => select.sql).join(' UNION ALL ');
      const hits = db
        .all<Raw>(`SELECT kind, key FROM (${union}) ORDER BY ${order} LIMIT ? OFFSET ?`, [
          ...selects.flatMap((select) => select.params),
          query.limit,
          query.offset,
        ])
        .map((raw) => ({ kind: raw.kind as SearchHit['kind'], key: Number(raw.key) }));
      return { hits, total, capped: total > COUNT_LIMIT };
    },

    /** Titles and snippets of notes on the page (highlighted when there is a text query). */
    noteHits(match: string | null, docIds: readonly number[]): Map<number, NoteHitRow> {
      if (docIds.length === 0) return new Map();
      const ids = JSON.stringify(docIds);
      const rows = match
        ? db.all<Raw>(
            `SELECT n.doc_id, n.id, n.path, n.title, n.type, n.updated_at,
               highlight(notes_fts, 0, ?, ?) AS title_highlight,
               snippet(notes_fts, 2, ?, ?, '…', 18) AS snippet
             FROM notes_fts CROSS JOIN notes n ON n.doc_id = notes_fts.rowid
             WHERE notes_fts MATCH ? AND notes_fts.rowid IN (SELECT value FROM json_each(?))`,
            [MATCH_START, MATCH_END, MATCH_START, MATCH_END, match, ids],
          )
        : db.all<Raw>(
            `SELECT n.doc_id, n.id, n.path, n.title, n.type, n.updated_at, NULL AS title_highlight,
               (SELECT substr(body, 1, 200) FROM notes_fts WHERE rowid = n.doc_id) AS snippet
             FROM notes n WHERE n.doc_id IN (SELECT value FROM json_each(?))`,
            [ids],
          );
      return new Map(
        rows.map((raw) => [
          Number(raw.doc_id),
          {
            docId: Number(raw.doc_id),
            id: String(raw.id),
            path: String(raw.path),
            title: String(raw.title),
            type: (raw.type as string | null) ?? null,
            updatedAt: String(raw.updated_at),
            titleHighlight: (raw.title_highlight as string | null) ?? null,
            snippet: (raw.snippet as string | null) ?? null,
          },
        ]),
      );
    },

    /** Source passages on the page, with their section and source. */
    sourceHits(match: string | null, chunkIds: readonly number[]): Map<number, SourceHitRow> {
      if (chunkIds.length === 0) return new Map();
      const ids = JSON.stringify(chunkIds);
      const columns = `c.id, c.locator_json, sec.ordinal AS section_ordinal, sec.label AS section_label,
        s.id AS source_id, s.title AS source_title, s.kind AS source_kind, s.path AS source_path`;
      const joins = `JOIN source_sections sec ON sec.id = c.section_id JOIN sources s ON s.id = c.owner_id`;
      const rows = match
        ? db.all<Raw>(
            `SELECT ${columns}, highlight(chunks_fts, 0, ?, ?) AS title_highlight,
               snippet(chunks_fts, 1, ?, ?, '…', 24) AS snippet
             FROM chunks_fts CROSS JOIN chunks c ON c.id = chunks_fts.rowid ${joins}
             WHERE chunks_fts MATCH ? AND chunks_fts.rowid IN (SELECT value FROM json_each(?))`,
            [MATCH_START, MATCH_END, MATCH_START, MATCH_END, match, ids],
          )
        : db.all<Raw>(
            `SELECT ${columns}, c.context_prefix AS title_highlight, substr(c.text, 1, 200) AS snippet
             FROM chunks c ${joins} WHERE c.id IN (SELECT value FROM json_each(?))`,
            [ids],
          );
      return new Map(
        rows.map((raw) => [
          Number(raw.id),
          {
            chunkId: Number(raw.id),
            locatorJson: String(raw.locator_json),
            sectionOrdinal: Number(raw.section_ordinal),
            sectionLabel: String(raw.section_label),
            sourceId: String(raw.source_id),
            sourceTitle: String(raw.source_title),
            sourceKind: raw.source_kind as SourceKind,
            sourcePath: String(raw.source_path),
            titleHighlight: String(raw.title_highlight ?? ''),
            snippet: String(raw.snippet ?? ''),
          },
        ]),
      );
    },

    recordRecent(kind: string, itemId: string, openedAt: string, keep: number): void {
      db.transaction(() => {
        db.run(
          `INSERT INTO recent_items (kind, item_id, opened_at) VALUES (?, ?, ?)
           ON CONFLICT (kind, item_id) DO UPDATE SET opened_at = excluded.opened_at`,
          [kind, itemId, openedAt],
        );
        db.run(
          `DELETE FROM recent_items WHERE kind = ? AND item_id NOT IN (
             SELECT item_id FROM recent_items WHERE kind = ? ORDER BY opened_at DESC LIMIT ?)`,
          [kind, kind, keep],
        );
      });
    },

    /** Recently opened notes that still exist, most recent first. */
    recentNotes(limit: number): { id: string; path: string; title: string; openedAt: string }[] {
      return db
        .all<Raw>(
          `SELECT n.id, n.path, n.title, r.opened_at
           FROM recent_items r JOIN notes n ON n.id = r.item_id
           WHERE r.kind = 'note'
           ORDER BY r.opened_at DESC
           LIMIT ?`,
          [limit],
        )
        .map((raw) => ({
          id: String(raw.id),
          path: String(raw.path),
          title: String(raw.title),
          openedAt: String(raw.opened_at),
        }));
    },
  };
}
