import type { SqlDatabase } from '../../db/sqlite';

/** SQL for concepts, their aliases and memberships (migration 0006). */

export interface ConceptRow {
  id: string;
  name: string;
  nameKey: string;
  slug: string;
  summary: string;
  noteId: string | null;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptListRow extends ConceptRow {
  aliases: string[];
  moduleIds: string[];
  topicIds: string[];
  mentionCount: number;
}

type Raw = Record<string, unknown>;

const toRow = (raw: Raw): ConceptRow => ({
  id: String(raw.id),
  name: String(raw.name),
  nameKey: String(raw.name_key),
  slug: String(raw.slug),
  summary: String(raw.summary ?? ''),
  noteId: (raw.note_id as string | null) ?? null,
  importance: Number(raw.importance),
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

const list = (value: unknown): string[] =>
  typeof value === 'string' && value !== '' ? (JSON.parse(value) as string[]) : [];

export type ConceptsRepository = ReturnType<typeof createConceptsRepository>;

export function createConceptsRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    /** Active concepts with their aliases, memberships and the number of notes linking to them. */
    all(): ConceptListRow[] {
      return db
        .all<Raw>(
          `SELECT c.*,
             (SELECT json_group_array(alias) FROM (SELECT alias FROM concept_aliases WHERE concept_id = c.id ORDER BY alias)) AS aliases,
             (SELECT json_group_array(module_id) FROM concept_modules WHERE concept_id = c.id) AS module_ids,
             (SELECT json_group_array(topic_id) FROM concept_topics WHERE concept_id = c.id) AS topic_ids,
             (SELECT count(DISTINCT source_doc) FROM note_links WHERE target_concept = c.id) AS mentions
           FROM concepts c WHERE c.status = 'active' ORDER BY c.name_key`,
        )
        .map((raw) => ({
          ...toRow(raw),
          aliases: list(raw.aliases),
          moduleIds: list(raw.module_ids),
          topicIds: list(raw.topic_ids),
          mentionCount: Number(raw.mentions),
        }));
    },

    byId(id: string): ConceptRow | null {
      const raw = db.get<Raw>('SELECT * FROM concepts WHERE id = ?', [id]);
      return raw ? toRow(raw) : null;
    },

    /** The concept whose name or alias has this case-folded key. */
    keyOwner(key: string): { id: string; name: string } | null {
      const raw = db.get<Raw>(
        `SELECT id, name FROM concepts WHERE name_key = ?
         UNION ALL
         SELECT c.id, c.name FROM concept_aliases a JOIN concepts c ON c.id = a.concept_id WHERE a.alias_key = ?
         LIMIT 1`,
        [key, key],
      );
      return raw ? { id: String(raw.id), name: String(raw.name) } : null;
    },

    slugTaken(slug: string, exceptId: string | null): boolean {
      return (
        db.get('SELECT 1 FROM concepts WHERE slug = ? AND id IS NOT ?', [slug, exceptId]) !==
        undefined
      );
    },

    insert(row: Omit<ConceptRow, 'updatedAt'>, createdBy: 'user' | 'ai' = 'user'): void {
      db.run(
        `INSERT INTO concepts (id, name, name_key, slug, summary, note_id, importance, created_by,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name,
          row.nameKey,
          row.slug,
          row.summary,
          row.noteId,
          row.importance,
          createdBy,
          row.createdAt,
          row.createdAt,
        ],
      );
    },

    update(row: ConceptRow): void {
      db.run(
        `UPDATE concepts SET name = ?, name_key = ?, slug = ?, summary = ?, note_id = ?, importance = ?,
           updated_at = ? WHERE id = ?`,
        [
          row.name,
          row.nameKey,
          row.slug,
          row.summary,
          row.noteId,
          row.importance,
          row.updatedAt,
          row.id,
        ],
      );
    },

    remove(id: string): void {
      db.run('DELETE FROM concepts WHERE id = ?', [id]);
    },

    setAliases(id: string, aliases: readonly { alias: string; key: string }[]): void {
      db.run('DELETE FROM concept_aliases WHERE concept_id = ?', [id]);
      for (const { alias, key } of aliases)
        db.run('INSERT INTO concept_aliases (concept_id, alias, alias_key) VALUES (?, ?, ?)', [
          id,
          alias,
          key,
        ]);
    },

    setModules(id: string, moduleIds: readonly string[]): void {
      db.run('DELETE FROM concept_modules WHERE concept_id = ?', [id]);
      for (const moduleId of moduleIds)
        db.run('INSERT INTO concept_modules (concept_id, module_id) VALUES (?, ?)', [id, moduleId]);
    },

    setTopics(id: string, topicIds: readonly string[]): void {
      db.run('DELETE FROM concept_topics WHERE concept_id = ?', [id]);
      for (const topicId of topicIds)
        db.run('INSERT INTO concept_topics (concept_id, topic_id) VALUES (?, ?)', [id, topicId]);
    },

    existingModules(ids: readonly string[]): Set<string> {
      return new Set(
        db
          .all<{ id: string }>(
            'SELECT id FROM modules WHERE id IN (SELECT value FROM json_each(?))',
            [JSON.stringify(ids)],
          )
          .map((row) => row.id),
      );
    },

    topicsWithModules(ids: readonly string[]): { id: string; title: string; moduleId: string }[] {
      return db
        .all<Raw>(
          'SELECT id, title, module_id FROM topics WHERE id IN (SELECT value FROM json_each(?)) ORDER BY title',
          [JSON.stringify(ids)],
        )
        .map((raw) => ({
          id: String(raw.id),
          title: String(raw.title),
          moduleId: String(raw.module_id),
        }));
    },

    modules(ids: readonly string[]): { id: string; code: string; title: string }[] {
      return db
        .all<Raw>(
          'SELECT id, code, title FROM modules WHERE id IN (SELECT value FROM json_each(?)) ORDER BY code_key',
          [JSON.stringify(ids)],
        )
        .map((raw) => ({ id: String(raw.id), code: String(raw.code), title: String(raw.title) }));
    },

    /** Lines of notes that link to the concept, grouped by the caller. */
    mentions(
      id: string,
    ): { noteId: string; path: string; title: string; line: number; context: string }[] {
      return db
        .all<Raw>(
          `SELECT n.id, n.path, n.title, l.line, l.context FROM note_links l
           JOIN notes n ON n.doc_id = l.source_doc
           WHERE l.target_concept = ? ORDER BY n.title, n.path, l.line`,
          [id],
        )
        .map((raw) => ({
          noteId: String(raw.id),
          path: String(raw.path),
          title: String(raw.title),
          line: Number(raw.line),
          context: String(raw.context),
        }));
    },
  };
}
