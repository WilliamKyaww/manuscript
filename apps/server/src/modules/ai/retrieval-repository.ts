import type { SqlDatabase, SqlValue } from '../../db/sqlite';

/**
 * SQL for grounding (task 10.07): source chunks and notes matching a full-text query within a
 * scope, chunks by id (for semantic hits), and the concepts and relations used to widen a question
 * to its neighbourhood in the graph. Full-text tables come first through CROSS JOIN, as in search:
 * otherwise SQLite may run the MATCH once for every row of the other table.
 */

export interface ScopeFilter {
  /** The module's code, lower-cased (sources' folders and notes' `module` property). */
  moduleCodeKey?: string;
  /** A lecture: its sources by attachment, its notes by `lecture` property. */
  lecture?: { id: string; codeKey: string; keyNorm: string };
  sourceIds?: readonly string[];
}

export interface ChunkRow {
  chunkId: number;
  sourceId: string;
  title: string;
  label: string;
  text: string;
  locatorJson: string;
  tokens: number;
}

export interface NoteHit {
  id: string;
  title: string;
}

type Raw = Record<string, unknown>;

const CHUNK_COLUMNS = `c.id AS chunk_id, s.id AS source_id, s.title, coalesce(sec.label, '') AS label,
  c.text, c.locator_json, c.token_estimate`;
const CHUNK_JOINS = `JOIN sources s ON s.id = c.owner_id AND c.owner_type = 'source'
  AND s.status = 'ready' AND s.deleted_at IS NULL
  LEFT JOIN source_sections sec ON sec.id = c.section_id`;

const toChunk = (raw: Raw): ChunkRow => ({
  chunkId: Number(raw.chunk_id),
  sourceId: String(raw.source_id),
  title: String(raw.title),
  label: String(raw.label),
  text: String(raw.text),
  locatorJson: String(raw.locator_json),
  tokens: Number(raw.token_estimate),
});

function sourceClauses(filter: ScopeFilter): { sql: string; params: SqlValue[] } {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  if (filter.moduleCodeKey) {
    parts.push('lower(s.module_code) = ?');
    params.push(filter.moduleCodeKey);
  }
  if (filter.lecture) {
    parts.push('s.id IN (SELECT source_id FROM lecture_sources WHERE lecture_id = ?)');
    params.push(filter.lecture.id);
  }
  if (filter.sourceIds?.length) {
    parts.push('s.id IN (SELECT value FROM json_each(?))');
    params.push(JSON.stringify(filter.sourceIds));
  }
  return { sql: parts.map((part) => ` AND ${part}`).join(''), params };
}

function noteClauses(filter: ScopeFilter): { sql: string; params: SqlValue[] } | null {
  // Notes cannot belong to a single source: a source filter leaves notes out.
  if (filter.sourceIds?.length) return null;
  const parts: string[] = [];
  const params: SqlValue[] = [];
  if (filter.moduleCodeKey) {
    parts.push('lower(n.module_code) = ?');
    params.push(filter.moduleCodeKey);
  }
  if (filter.lecture) {
    const { codeKey, keyNorm } = filter.lecture;
    parts.push(`(lower(n.lecture_key) = ? || '/' || ?
      OR (lower(n.lecture_key) = ? AND lower(coalesce(n.module_code, '')) = ?))`);
    params.push(codeKey, keyNorm, keyNorm, codeKey);
  }
  return { sql: parts.map((part) => ` AND ${part}`).join(''), params };
}

export type RetrievalRepository = ReturnType<typeof createRetrievalRepository>;

export function createRetrievalRepository(db: SqlDatabase) {
  return {
    /** Best-ranked source chunks for an FTS5 query (BM25), within the scope. */
    chunks(match: string, filter: ScopeFilter, limit: number): ChunkRow[] {
      const scope = sourceClauses(filter);
      return db
        .all<Raw>(
          `SELECT ${CHUNK_COLUMNS} FROM chunks_fts CROSS JOIN chunks c ON c.id = chunks_fts.rowid
           ${CHUNK_JOINS}
           WHERE chunks_fts MATCH ?${scope.sql} ORDER BY chunks_fts.rank LIMIT ?`,
          [match, ...scope.params, limit],
        )
        .map(toChunk);
    },

    /** Chunks by id that are still in scope (semantic hits are filtered here). */
    chunksByIds(ids: readonly number[], filter: ScopeFilter): ChunkRow[] {
      if (ids.length === 0) return [];
      const scope = sourceClauses(filter);
      return db
        .all<Raw>(
          `SELECT ${CHUNK_COLUMNS} FROM chunks c ${CHUNK_JOINS}
           WHERE c.id IN (SELECT value FROM json_each(?))${scope.sql}`,
          [JSON.stringify(ids), ...scope.params],
        )
        .map(toChunk);
    },

    /** Best-ranked notes for an FTS5 query, within the scope. */
    notes(match: string, filter: ScopeFilter, limit: number): NoteHit[] {
      const scope = noteClauses(filter);
      if (!scope) return [];
      return db
        .all<Raw>(
          `SELECT n.id, n.title FROM notes_fts CROSS JOIN notes n ON n.doc_id = notes_fts.rowid
           WHERE notes_fts MATCH ?${scope.sql} ORDER BY notes_fts.rank LIMIT ?`,
          [match, ...scope.params, limit],
        )
        .map((raw) => ({ id: String(raw.id), title: String(raw.title) }));
    },

    /** Notes by id that are still in scope. */
    notesByIds(ids: readonly string[], filter: ScopeFilter): NoteHit[] {
      const scope = noteClauses(filter);
      if (!scope || ids.length === 0) return [];
      return db
        .all<Raw>(
          `SELECT n.id, n.title FROM notes n
           WHERE n.id IN (SELECT value FROM json_each(?))${scope.sql}`,
          [JSON.stringify(ids), ...scope.params],
        )
        .map((raw) => ({ id: String(raw.id), title: String(raw.title) }));
    },

    /** Active concepts with their names and aliases, for spotting them in a question. */
    conceptNames(): { id: string; names: string[]; noteId: string | null }[] {
      const map = new Map<string, { id: string; names: string[]; noteId: string | null }>();
      for (const raw of db.all<Raw>(
        `SELECT c.id, c.name, c.note_id, a.alias FROM concepts c
         LEFT JOIN concept_aliases a ON a.concept_id = c.id WHERE c.status = 'active'`,
      )) {
        const id = String(raw.id);
        const entry = map.get(id) ?? {
          id,
          names: [String(raw.name)],
          noteId: raw.note_id === null ? null : String(raw.note_id),
        };
        if (raw.alias !== null && raw.alias !== undefined) entry.names.push(String(raw.alias));
        map.set(id, entry);
      }
      return [...map.values()];
    },

    /** Concepts related to these (accepted or proposed relations, either direction). */
    relatedConcepts(ids: readonly string[]): string[] {
      if (ids.length === 0) return [];
      const json = JSON.stringify(ids);
      return db
        .all<Raw>(
          `SELECT to_id AS id FROM relations WHERE from_type = 'concept' AND to_type = 'concept'
             AND status != 'rejected' AND from_id IN (SELECT value FROM json_each(?))
           UNION SELECT from_id FROM relations WHERE from_type = 'concept' AND to_type = 'concept'
             AND status != 'rejected' AND to_id IN (SELECT value FROM json_each(?))`,
          [json, json],
        )
        .map((raw) => String(raw.id));
    },

    /** Notes linking to these concepts. */
    notesMentioning(conceptIds: readonly string[], limit: number): string[] {
      if (conceptIds.length === 0) return [];
      return db
        .all<Raw>(
          `SELECT DISTINCT n.id FROM note_links l JOIN notes n ON n.doc_id = l.source_doc
           WHERE l.target_concept IN (SELECT value FROM json_each(?)) LIMIT ?`,
          [JSON.stringify(conceptIds), limit],
        )
        .map((raw) => String(raw.id));
    },
  };
}
