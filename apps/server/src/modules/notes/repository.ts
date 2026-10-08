import type { SqlDatabase } from '../../db/sqlite';

/** SQL for the notes index (migration 0002). No business rules: see indexer.ts and service.ts. */

export interface NoteRow {
  docId: number;
  id: string;
  path: string;
  title: string;
  type: string | null;
  moduleCode: string | null;
  lectureKey: string | null;
  frontmatterJson: string;
  contentHash: string;
  sizeBytes: number;
  mtimeMs: number;
  wordCount: number;
  idPersisted: boolean;
  warningsJson: string;
  createdAt: string;
  updatedAt: string;
  indexedAt: string;
}

/** Everything written for a note except its doc id. */
export interface NoteData extends Omit<NoteRow, 'docId'> {
  pathKey: string;
  nameKey: string;
  titleKey: string;
}

export interface FtsData {
  title: string;
  headings: string;
  body: string;
  tags: string;
}

export interface LinkResolutionRow {
  targetKind: 'note' | 'attachment' | 'concept' | 'unresolved';
  targetDoc: number | null;
  targetPath: string | null;
  /** The concept a link resolves to (when no note has the name). */
  targetConcept: string | null;
  ambiguous: boolean;
}

export interface LinkInsert extends LinkResolutionRow {
  ordinal: number;
  syntax: 'wikilink' | 'markdown';
  embed: boolean;
  targetRaw: string;
  targetNameKey: string;
  heading: string | null;
  blockRef: string | null;
  alias: string | null;
  line: number;
  column: number;
  context: string;
}

export interface LinkRow extends LinkInsert {
  linkId: number;
  sourceDoc: number;
  sourcePath: string;
}

export interface AttachmentRow {
  path: string;
  nameKey: string;
  sizeBytes: number;
  mtimeMs: number;
  mediaType: string;
  indexedAt: string;
}

export interface SummaryRow {
  id: string;
  path: string;
  title: string;
  type: string | null;
  aliases: string[];
  updatedAt: string;
}

export interface BacklinkRow {
  sourceId: string;
  sourcePath: string;
  sourceTitle: string;
  line: number;
  column: number;
  embed: boolean;
  context: string;
}

type Raw = Record<string, unknown>;

const NOTE_COLUMNS = `doc_id, id, path, title, type, module_code, lecture_key, frontmatter_json, content_hash,
  size_bytes, mtime_ms, word_count, id_persisted, warnings_json, created_at, updated_at, indexed_at`;

function toNoteRow(raw: Raw): NoteRow {
  return {
    docId: Number(raw.doc_id),
    id: String(raw.id),
    path: String(raw.path),
    title: String(raw.title),
    type: (raw.type as string | null) ?? null,
    moduleCode: (raw.module_code as string | null) ?? null,
    lectureKey: (raw.lecture_key as string | null) ?? null,
    frontmatterJson: String(raw.frontmatter_json),
    contentHash: String(raw.content_hash),
    sizeBytes: Number(raw.size_bytes),
    mtimeMs: Number(raw.mtime_ms),
    wordCount: Number(raw.word_count),
    idPersisted: raw.id_persisted === 1,
    warningsJson: String(raw.warnings_json),
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
    indexedAt: String(raw.indexed_at),
  };
}

const LINK_COLUMNS = `l.link_id, l.source_doc, s.path AS source_path, l.ordinal, l.syntax, l.embed, l.target_raw,
  l.target_name_key, l.heading, l.block_ref, l.alias, l.target_kind, l.target_doc, l.target_path, l.target_concept,
  l.ambiguous, l.line, l.col, l.context`;

function toLinkRow(raw: Raw): LinkRow {
  return {
    linkId: Number(raw.link_id),
    sourceDoc: Number(raw.source_doc),
    sourcePath: String(raw.source_path),
    ordinal: Number(raw.ordinal),
    syntax: raw.syntax as LinkRow['syntax'],
    embed: raw.embed === 1,
    targetRaw: String(raw.target_raw),
    targetNameKey: String(raw.target_name_key),
    heading: (raw.heading as string | null) ?? null,
    blockRef: (raw.block_ref as string | null) ?? null,
    alias: (raw.alias as string | null) ?? null,
    targetKind: raw.target_kind as LinkRow['targetKind'],
    targetDoc: raw.target_doc === null ? null : Number(raw.target_doc),
    targetPath: (raw.target_path as string | null) ?? null,
    targetConcept: (raw.target_concept as string | null) ?? null,
    ambiguous: raw.ambiguous === 1,
    line: Number(raw.line),
    column: Number(raw.col),
    context: String(raw.context),
  };
}

/** Splits a list into chunks small enough for SQLite's bound-parameter limit. */
function chunked<T>(items: readonly T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;

export function createNotesRepository(db: SqlDatabase) {
  const noteParams = (data: NoteData) => [
    data.id,
    data.path,
    data.pathKey,
    data.nameKey,
    data.title,
    data.titleKey,
    data.type,
    data.moduleCode,
    data.lectureKey,
    data.frontmatterJson,
    data.contentHash,
    data.sizeBytes,
    data.mtimeMs,
    data.wordCount,
    data.idPersisted ? 1 : 0,
    data.warningsJson,
    data.createdAt,
    data.updatedAt,
    data.indexedAt,
  ];

  return {
    transaction<T>(fn: () => T): T {
      return db.transaction(fn);
    },

    // --- notes ---------------------------------------------------------------------------------

    byId(id: string): NoteRow | undefined {
      const raw = db.get<Raw>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ?`, [id]);
      return raw ? toNoteRow(raw) : undefined;
    },

    byPath(path: string): NoteRow | undefined {
      const raw = db.get<Raw>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE path = ?`, [path]);
      return raw ? toNoteRow(raw) : undefined;
    },

    byDoc(docId: number): NoteRow | undefined {
      const raw = db.get<Raw>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE doc_id = ?`, [docId]);
      return raw ? toNoteRow(raw) : undefined;
    },

    all(): NoteRow[] {
      return db.all<Raw>(`SELECT ${NOTE_COLUMNS} FROM notes ORDER BY path`).map(toNoteRow);
    },

    /** Notes whose path is inside `folder` (vault-relative, no trailing slash). */
    inFolder(folder: string): NoteRow[] {
      const prefix = `${folder}/`;
      return db
        .all<Raw>(`SELECT ${NOTE_COLUMNS} FROM notes WHERE substr(path, 1, ?) = ? ORDER BY path`, [
          prefix.length,
          prefix,
        ])
        .map(toNoteRow);
    },

    count(): number {
      return Number(db.get<{ count: number }>('SELECT count(*) AS count FROM notes')?.count ?? 0);
    },

    insert(data: NoteData): number {
      return db.run(
        `INSERT INTO notes (id, path, path_key, name_key, title, title_key, type, module_code, lecture_key,
           frontmatter_json, content_hash, size_bytes, mtime_ms, word_count, id_persisted, warnings_json,
           created_at, updated_at, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        noteParams(data),
      ).lastInsertRowid;
    },

    update(docId: number, data: NoteData): void {
      db.run(
        `UPDATE notes SET id = ?, path = ?, path_key = ?, name_key = ?, title = ?, title_key = ?, type = ?,
           module_code = ?, lecture_key = ?, frontmatter_json = ?, content_hash = ?, size_bytes = ?, mtime_ms = ?,
           word_count = ?, id_persisted = ?, warnings_json = ?, created_at = ?, updated_at = ?, indexed_at = ?
         WHERE doc_id = ?`,
        [...noteParams(data), docId],
      );
    },

    /** Records a new modification time for unchanged content. */
    touch(docId: number, mtimeMs: number, updatedAt: string): void {
      db.run('UPDATE notes SET mtime_ms = ?, updated_at = ? WHERE doc_id = ?', [
        mtimeMs,
        updatedAt,
        docId,
      ]);
    },

    delete(docId: number): void {
      db.run('DELETE FROM notes_fts WHERE rowid = ?', [docId]);
      db.run('DELETE FROM notes WHERE doc_id = ?', [docId]);
    },

    setAliases(docId: number, aliases: readonly { alias: string; key: string }[]): void {
      db.run('DELETE FROM note_aliases WHERE doc_id = ?', [docId]);
      for (const { alias, key } of aliases) {
        db.run('INSERT OR IGNORE INTO note_aliases (doc_id, alias, alias_key) VALUES (?, ?, ?)', [
          docId,
          alias,
          key,
        ]);
      }
    },

    setTags(docId: number, tags: readonly string[]): void {
      db.run('DELETE FROM note_tags WHERE doc_id = ?', [docId]);
      for (const tag of tags)
        db.run('INSERT OR IGNORE INTO note_tags (doc_id, tag) VALUES (?, ?)', [docId, tag]);
    },

    setFts(docId: number, fts: FtsData): void {
      db.run('DELETE FROM notes_fts WHERE rowid = ?', [docId]);
      db.run('INSERT INTO notes_fts (rowid, title, headings, body, tags) VALUES (?, ?, ?, ?, ?)', [
        docId,
        fts.title,
        fts.headings,
        fts.body,
        fts.tags,
      ]);
    },

    /** Notes with their aliases, for building the link resolver. */
    resolvable(): { docId: number; id: string; path: string; title: string; aliases: string[] }[] {
      return db
        .all<Raw>(
          `SELECT n.doc_id, n.id, n.path, n.title,
             (SELECT json_group_array(a.alias) FROM note_aliases a WHERE a.doc_id = n.doc_id) AS aliases
           FROM notes n`,
        )
        .map((raw) => ({
          docId: Number(raw.doc_id),
          id: String(raw.id),
          path: String(raw.path),
          title: String(raw.title),
          aliases: JSON.parse(String(raw.aliases ?? '[]')) as string[],
        }));
    },

    summaries(): SummaryRow[] {
      return db
        .all<Raw>(
          `SELECT n.id, n.path, n.title, n.type, n.updated_at,
             (SELECT json_group_array(a.alias) FROM note_aliases a WHERE a.doc_id = n.doc_id) AS aliases
           FROM notes n ORDER BY n.path`,
        )
        .map((raw) => ({
          id: String(raw.id),
          path: String(raw.path),
          title: String(raw.title),
          type: (raw.type as string | null) ?? null,
          aliases: JSON.parse(String(raw.aliases ?? '[]')) as string[],
          updatedAt: String(raw.updated_at),
        }));
    },

    aliases(docId: number): string[] {
      return db
        .all<{ alias: string }>(
          'SELECT alias FROM note_aliases WHERE doc_id = ? ORDER BY alias_key',
          [docId],
        )
        .map((row) => row.alias);
    },

    tags(docId: number): string[] {
      return db
        .all<{ tag: string }>('SELECT tag FROM note_tags WHERE doc_id = ? ORDER BY tag', [docId])
        .map((row) => row.tag);
    },

    tagCounts(): { tag: string; count: number }[] {
      return db
        .all<{ tag: string; count: number }>(
          'SELECT tag, count(*) AS count FROM note_tags GROUP BY tag ORDER BY tag',
        )
        .map((row) => ({ tag: row.tag, count: Number(row.count) }));
    },

    // --- links ---------------------------------------------------------------------------------

    setLinks(docId: number, links: readonly LinkInsert[]): void {
      db.run('DELETE FROM note_links WHERE source_doc = ?', [docId]);
      for (const link of links) {
        db.run(
          `INSERT INTO note_links (source_doc, ordinal, syntax, embed, target_raw, target_name_key, heading, block_ref,
             alias, target_kind, target_doc, target_path, target_concept, ambiguous, line, col, context)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            docId,
            link.ordinal,
            link.syntax,
            link.embed ? 1 : 0,
            link.targetRaw,
            link.targetNameKey,
            link.heading,
            link.blockRef,
            link.alias,
            link.targetKind,
            link.targetDoc,
            link.targetPath,
            link.targetConcept,
            link.ambiguous ? 1 : 0,
            link.line,
            link.column,
            link.context,
          ],
        );
      }
    },

    linksFrom(docId: number): LinkRow[] {
      return db
        .all<Raw>(
          `SELECT ${LINK_COLUMNS} FROM note_links l JOIN notes s ON s.doc_id = l.source_doc
           WHERE l.source_doc = ? ORDER BY l.ordinal`,
          [docId],
        )
        .map(toLinkRow);
    },

    /** Links whose target's last path segment is one of `nameKeys` (candidates for re-resolution). */
    linksByNameKeys(nameKeys: Iterable<string>): LinkRow[] {
      const rows: LinkRow[] = [];
      for (const keys of chunked([...new Set(nameKeys)].filter((key) => key !== ''))) {
        const placeholders = keys.map(() => '?').join(', ');
        rows.push(
          ...db
            .all<Raw>(
              `SELECT ${LINK_COLUMNS} FROM note_links l JOIN notes s ON s.doc_id = l.source_doc
               WHERE l.target_name_key IN (${placeholders})`,
              keys,
            )
            .map(toLinkRow),
        );
      }
      return rows;
    },

    /** Links pointing at any of the given notes or attachment paths. */
    linksTo(docIds: readonly number[], attachmentPaths: readonly string[] = []): LinkRow[] {
      const rows: LinkRow[] = [];
      for (const ids of chunked(docIds)) {
        rows.push(
          ...db
            .all<Raw>(
              `SELECT ${LINK_COLUMNS} FROM note_links l JOIN notes s ON s.doc_id = l.source_doc
               WHERE l.target_doc IN (${ids.map(() => '?').join(', ')})`,
              ids,
            )
            .map(toLinkRow),
        );
      }
      for (const paths of chunked(attachmentPaths)) {
        rows.push(
          ...db
            .all<Raw>(
              `SELECT ${LINK_COLUMNS} FROM note_links l JOIN notes s ON s.doc_id = l.source_doc
               WHERE l.target_kind = 'attachment' AND l.target_path IN (${paths.map(() => '?').join(', ')})`,
              paths,
            )
            .map(toLinkRow),
        );
      }
      return rows;
    },

    updateLinkResolution(linkId: number, resolution: LinkResolutionRow): void {
      db.run(
        `UPDATE note_links SET target_kind = ?, target_doc = ?, target_path = ?, target_concept = ?,
           ambiguous = ? WHERE link_id = ?`,
        [
          resolution.targetKind,
          resolution.targetDoc,
          resolution.targetPath,
          resolution.targetConcept,
          resolution.ambiguous ? 1 : 0,
          linkId,
        ],
      );
    },

    backlinks(docId: number): BacklinkRow[] {
      return db
        .all<Raw>(
          `SELECT s.id AS source_id, s.path AS source_path, s.title AS source_title, l.line, l.col, l.embed, l.context
           FROM note_links l JOIN notes s ON s.doc_id = l.source_doc
           WHERE l.target_doc = ? AND l.source_doc <> ?
           ORDER BY s.path, l.ordinal`,
          [docId, docId],
        )
        .map((raw) => ({
          sourceId: String(raw.source_id),
          sourcePath: String(raw.source_path),
          sourceTitle: String(raw.source_title),
          line: Number(raw.line),
          column: Number(raw.col),
          embed: raw.embed === 1,
          context: String(raw.context),
        }));
    },

    /** Notes that already link to `docId` (excluded from unlinked mentions). */
    sourcesLinkingTo(docId: number): Set<number> {
      return new Set(
        db
          .all<{ source_doc: number }>(
            'SELECT DISTINCT source_doc FROM note_links WHERE target_doc = ?',
            [docId],
          )
          .map((row) => Number(row.source_doc)),
      );
    },

    /** Full-text candidates for a phrase (used for unlinked mentions). */
    ftsPhraseMatches(phrase: string, limit: number): number[] {
      const quoted = `"${phrase.replace(/"/g, '""')}"`;
      return db
        .all<{ rowid: number }>('SELECT rowid FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?', [
          `body : ${quoted}`,
          limit,
        ])
        .map((row) => Number(row.rowid));
    },

    // --- attachments ---------------------------------------------------------------------------

    allAttachments(): AttachmentRow[] {
      return db
        .all<Raw>(
          'SELECT path, name_key, size_bytes, mtime_ms, media_type, indexed_at FROM attachments ORDER BY path',
        )
        .map((raw) => ({
          path: String(raw.path),
          nameKey: String(raw.name_key),
          sizeBytes: Number(raw.size_bytes),
          mtimeMs: Number(raw.mtime_ms),
          mediaType: String(raw.media_type),
          indexedAt: String(raw.indexed_at),
        }));
    },

    attachment(path: string): AttachmentRow | undefined {
      const raw = db.get<Raw>(
        'SELECT path, name_key, size_bytes, mtime_ms, media_type, indexed_at FROM attachments WHERE path = ?',
        [path],
      );
      return raw
        ? {
            path: String(raw.path),
            nameKey: String(raw.name_key),
            sizeBytes: Number(raw.size_bytes),
            mtimeMs: Number(raw.mtime_ms),
            mediaType: String(raw.media_type),
            indexedAt: String(raw.indexed_at),
          }
        : undefined;
    },

    attachmentCount(): number {
      return Number(
        db.get<{ count: number }>('SELECT count(*) AS count FROM attachments')?.count ?? 0,
      );
    },

    upsertAttachment(row: AttachmentRow): void {
      db.run(
        `INSERT INTO attachments (path, name_key, size_bytes, mtime_ms, media_type, indexed_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (path) DO UPDATE SET name_key = excluded.name_key, size_bytes = excluded.size_bytes,
           mtime_ms = excluded.mtime_ms, media_type = excluded.media_type, indexed_at = excluded.indexed_at`,
        [row.path, row.nameKey, row.sizeBytes, row.mtimeMs, row.mediaType, row.indexedAt],
      );
    },

    deleteAttachment(path: string): void {
      db.run('DELETE FROM attachments WHERE path = ?', [path]);
    },
  };
}
