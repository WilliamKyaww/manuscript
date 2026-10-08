import type { SearchFilters } from '@skb/core';
import type { SqlDatabase, SqlValue } from '../../db/sqlite';

/** SQL for full-text search over `notes_fts` (migration 0002) and for recent items (0003). */

/** Snippet markers: control characters that cannot occur in indexed note text. */
export const MATCH_START = '\u0002';
export const MATCH_END = '\u0003';

/** Matches are counted up to this many; beyond it the total is reported as "more than". */
export const COUNT_LIMIT = 1000;

export interface NoteSearchRow {
  docId: number;
  id: string;
  path: string;
  title: string;
  type: string | null;
  updatedAt: string;
  titleHighlight: string | null;
  snippet: string | null;
}

export interface NoteSearchQuery {
  match: string | null;
  exclude: string | null;
  filters: SearchFilters;
  excludedFilters: SearchFilters;
  limit: number;
  offset: number;
}

type Raw = Record<string, unknown>;

/** WHERE clauses for filters. Several tags must all apply; several types, folders or modules are alternatives. */
function filterClauses(
  filters: SearchFilters,
  negate: boolean,
): { sql: string[]; params: SqlValue[] } {
  const sql: string[] = [];
  const params: SqlValue[] = [];
  const not = negate ? 'NOT ' : '';
  for (const tag of filters.tag) {
    sql.push(
      // The tag itself or any nested tag: a range ("tag/" < t < "tag0") so the index is used.
      `n.doc_id ${not}IN (SELECT doc_id FROM note_tags WHERE tag = ? OR (tag > ? AND tag < ?))`,
    );
    params.push(tag, `${tag}/`, `${tag}0`);
  }
  const anyOf = (values: string[], clause: string, toParams: (value: string) => SqlValue[]) => {
    if (values.length === 0) return;
    sql.push(`${not}(${values.map(() => clause).join(' OR ')})`);
    for (const value of values) params.push(...toParams(value));
  };
  anyOf(filters.type, "lower(coalesce(n.type, '')) = lower(?)", (value) => [value]);
  anyOf(filters.module, "lower(coalesce(n.module_code, '')) = lower(?)", (value) => [value]);
  anyOf(filters.folder, 'lower(substr(n.path, 1, ?)) = lower(?)', (value) => [
    value.length + 1,
    `${value}/`,
  ]);
  return { sql, params };
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

export function createSearchRepository(db: SqlDatabase) {
  return {
    /** One page of matching notes and the number of matches (capped at COUNT_LIMIT + 1). */
    searchNotes(query: NoteSearchQuery): { rows: NoteSearchRow[]; total: number; capped: boolean } {
      const where: string[] = [];
      const params: SqlValue[] = [];
      for (const negate of [false, true]) {
        const clauses = filterClauses(negate ? query.excludedFilters : query.filters, negate);
        where.push(...clauses.sql);
        params.push(...clauses.params);
      }
      if (query.exclude) {
        where.push('n.doc_id NOT IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)');
        params.push(query.exclude);
      }

      if (query.match) {
        const filter = where.length > 0 ? ` AND ${where.join(' AND ')}` : '';
        // CROSS JOIN keeps the full-text index as the outer loop (SQLite's join-order hint): one
        // MATCH, then cheap per-row filter checks. Otherwise the planner may loop over filtered
        // notes and run the MATCH once for each of them.
        const from = `FROM notes_fts CROSS JOIN notes n ON n.doc_id = notes_fts.rowid WHERE notes_fts MATCH ?${filter}`;
        const total = Number(
          db.get<{ total: number }>(
            `SELECT count(*) AS total FROM (SELECT 1 ${from} LIMIT ${COUNT_LIMIT + 1})`,
            [query.match, ...params],
          )?.total ?? 0,
        );
        const rows = db.all<Raw>(
          `SELECT n.doc_id, n.id, n.path, n.title, n.type, n.updated_at,
             highlight(notes_fts, 0, ?, ?) AS title_highlight,
             snippet(notes_fts, 2, ?, ?, '…', 18) AS snippet
           ${from}
           ORDER BY notes_fts.rank
           LIMIT ? OFFSET ?`,
          [
            MATCH_START,
            MATCH_END,
            MATCH_START,
            MATCH_END,
            query.match,
            ...params,
            query.limit,
            query.offset,
          ],
        );
        return { rows: rows.map(toRow), total, capped: total > COUNT_LIMIT };
      }

      // Filters only: newest first, with the start of the body as the snippet.
      const filter = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const total = Number(
        db.get<{ total: number }>(
          `SELECT count(*) AS total FROM (SELECT 1 FROM notes n ${filter} LIMIT ${COUNT_LIMIT + 1})`,
          params,
        )?.total ?? 0,
      );
      const rows = db.all<Raw>(
        `SELECT n.doc_id, n.id, n.path, n.title, n.type, n.updated_at, NULL AS title_highlight,
           (SELECT substr(body, 1, 200) FROM notes_fts WHERE rowid = n.doc_id) AS snippet
         FROM notes n ${filter}
         ORDER BY n.updated_at DESC, n.path
         LIMIT ? OFFSET ?`,
        [...params, query.limit, query.offset],
      );
      return { rows: rows.map(toRow), total, capped: total > COUNT_LIMIT };
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

function toRow(raw: Raw): NoteSearchRow {
  return {
    docId: Number(raw.doc_id),
    id: String(raw.id),
    path: String(raw.path),
    title: String(raw.title),
    type: (raw.type as string | null) ?? null,
    updatedAt: String(raw.updated_at),
    titleHighlight: (raw.title_highlight as string | null) ?? null,
    snippet: (raw.snippet as string | null) ?? null,
  };
}
