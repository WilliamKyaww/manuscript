import type { SourceKind } from '@skb/core';
import type { SqlDatabase, SqlValue } from '../../db/sqlite';
import { and, type FilterInput, whereClauses } from './clauses';

export type { SearchScope } from './clauses';

/**
 * SQL for full-text search over notes (`notes_fts`, migration 0002) and source passages
 * (`chunks_fts`, 0005), and for recent items (0003).
 *
 * A text query reads each index in its own rank order: FTS5 sorts by `rank` itself, so with a LIMIT
 * it stops early, and highlights and snippets are computed only for the rows returned. The two
 * ranked lists (BM25 scores from both indexes are on the same scale) are merged here. Ranking a
 * UNION of both in SQL instead sorts every match first — several times slower on large vaults.
 * CROSS JOIN keeps the full-text index as the outer loop, so filters are cheap per-row checks.
 */

/** Snippet markers: control characters that cannot occur in indexed text. */
export const MATCH_START = '\u0002';
export const MATCH_END = '\u0003';

/** Matches are counted up to this many; beyond it the total is reported as "more than". */
export const COUNT_LIMIT = 1000;

export interface SearchQuery extends FilterInput {
  match: string | null;
  limit: number;
  offset: number;
}

export interface NoteHitRow {
  kind: 'note';
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
  kind: 'source';
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

export type SearchRow = NoteHitRow | SourceHitRow;

export interface SearchPage {
  rows: SearchRow[];
  total: number;
  capped: boolean;
}

type Raw = Record<string, unknown>;

const NOTE_COLUMNS = 'n.doc_id, n.id, n.path, n.title, n.type, n.updated_at';
const SOURCE_COLUMNS = `c.id AS chunk_id, c.section_id, c.locator_json, sec.ordinal AS section_ordinal,
  sec.label AS section_label, s.id AS source_id, s.title AS source_title, s.kind AS source_kind,
  s.path AS source_path`;
const SOURCE_JOINS =
  'JOIN source_sections sec ON sec.id = c.section_id JOIN sources s ON s.id = c.owner_id';

function noteRow(raw: Raw): NoteHitRow {
  return {
    kind: 'note',
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

function sourceRow(raw: Raw): SourceHitRow {
  return {
    kind: 'source',
    chunkId: Number(raw.chunk_id),
    locatorJson: String(raw.locator_json),
    sectionOrdinal: Number(raw.section_ordinal),
    sectionLabel: String(raw.section_label),
    sourceId: String(raw.source_id),
    sourceTitle: String(raw.source_title),
    sourceKind: raw.source_kind as SourceKind,
    sourcePath: String(raw.source_path),
    titleHighlight: String(raw.title_highlight ?? ''),
    snippet: String(raw.snippet ?? ''),
  };
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

export function createSearchRepository(db: SqlDatabase) {
  const count = (select: string, params: SqlValue[]) =>
    Number(
      db.get<{ total: number }>(
        `SELECT count(*) AS total FROM (${select} LIMIT ${COUNT_LIMIT + 1})`,
        params,
      )?.total ?? 0,
    );

  const ranked = (query: SearchQuery & { match: string }): SearchPage => {
    const { note, source } = whereClauses(query);
    const needed = query.offset + query.limit;
    const hits: { rank: number; row: SearchRow }[] = [];
    let total = 0;
    if (query.scope.notes) {
      const from = `FROM notes_fts CROSS JOIN notes n ON n.doc_id = notes_fts.rowid
        WHERE notes_fts MATCH ?${and(note)}`;
      const params = [query.match, ...note.params];
      total += count(`SELECT 1 ${from}`, params);
      const rows = db.all<Raw>(
        `SELECT ${NOTE_COLUMNS}, notes_fts.rank AS rank,
           highlight(notes_fts, 0, ?, ?) AS title_highlight,
           snippet(notes_fts, 2, ?, ?, '…', 18) AS snippet
         ${from} ORDER BY notes_fts.rank LIMIT ?`,
        [MATCH_START, MATCH_END, MATCH_START, MATCH_END, ...params, needed],
      );
      for (const raw of rows) hits.push({ rank: Number(raw.rank), row: noteRow(raw) });
    }
    if (query.scope.sourceKinds.length > 0) {
      const from = `FROM chunks_fts CROSS JOIN chunks c ON c.id = chunks_fts.rowid ${SOURCE_JOINS}
        WHERE chunks_fts MATCH ? AND c.owner_type = 'source'${and(source)}`;
      const params = [query.match, ...source.params];
      total += count(`SELECT DISTINCT c.section_id ${from}`, params);
      // One hit per page, slide or section: its best chunk. Chunks arrive best first, so the first
      // one seen for a section is kept; more are fetched only when too few sections were found.
      for (let fetch = needed * 3 + 20; ; fetch *= 4) {
        const rows = db.all<Raw>(
          `SELECT ${SOURCE_COLUMNS}, chunks_fts.rank AS rank,
             highlight(chunks_fts, 0, ?, ?) AS title_highlight,
             snippet(chunks_fts, 1, ?, ?, '…', 24) AS snippet
           ${from} ORDER BY chunks_fts.rank LIMIT ?`,
          [MATCH_START, MATCH_END, MATCH_START, MATCH_END, ...params, fetch],
        );
        const seen = new Set<number>();
        const best = rows.filter((raw) => {
          const section = Number(raw.section_id);
          if (seen.has(section)) return false;
          seen.add(section);
          return true;
        });
        if (best.length >= needed || rows.length < fetch) {
          for (const raw of best.slice(0, needed))
            hits.push({ rank: Number(raw.rank), row: sourceRow(raw) });
          break;
        }
      }
    }
    hits.sort((a, b) => a.rank - b.rank || (a.row.kind < b.row.kind ? -1 : 1));
    return {
      rows: hits.slice(query.offset, needed).map((hit) => hit.row),
      total,
      capped: total > COUNT_LIMIT,
    };
  };

  /** Filters only: notes and sources (by their first passage) together, newest first. */
  const listing = (query: SearchQuery): SearchPage => {
    const { note, source } = whereClauses(query);
    const selects: { sql: string; params: SqlValue[] }[] = [];
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
    if (selects.length === 0) return { rows: [], total: 0, capped: false };
    const total = selects.reduce((sum, select) => sum + count(select.sql, select.params), 0);
    const hits = db.all<Raw>(
      `SELECT kind, key FROM (${selects.map((select) => select.sql).join(' UNION ALL ')})
       ORDER BY sort DESC, tiebreak, kind, key LIMIT ? OFFSET ?`,
      [...selects.flatMap((select) => select.params), query.limit, query.offset],
    );
    const ids = (kind: string) =>
      JSON.stringify(hits.filter((hit) => hit.kind === kind).map((hit) => Number(hit.key)));
    const notes = new Map(
      db
        .all<Raw>(
          `SELECT ${NOTE_COLUMNS}, NULL AS title_highlight,
             (SELECT substr(body, 1, 200) FROM notes_fts WHERE rowid = n.doc_id) AS snippet
           FROM notes n WHERE n.doc_id IN (SELECT value FROM json_each(?))`,
          [ids('note')],
        )
        .map((raw) => [Number(raw.doc_id), noteRow(raw)]),
    );
    const sources = new Map(
      db
        .all<Raw>(
          `SELECT ${SOURCE_COLUMNS}, c.context_prefix AS title_highlight, substr(c.text, 1, 200) AS snippet
           FROM chunks c ${SOURCE_JOINS} WHERE c.id IN (SELECT value FROM json_each(?))`,
          [ids('source')],
        )
        .map((raw) => [Number(raw.chunk_id), sourceRow(raw)]),
    );
    const rows = hits.flatMap((hit): SearchRow[] => {
      const row = (hit.kind === 'note' ? notes : sources).get(Number(hit.key));
      return row ? [row] : [];
    });
    return { rows, total, capped: total > COUNT_LIMIT };
  };

  return {
    /** One page of results and the number of matches (capped just above COUNT_LIMIT). */
    search(query: SearchQuery): SearchPage {
      return query.match ? ranked({ ...query, match: query.match }) : listing(query);
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
