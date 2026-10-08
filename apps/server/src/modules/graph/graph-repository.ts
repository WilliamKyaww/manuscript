import type { SqlDatabase } from '../../db/sqlite';
import type { RelationsRepository } from './relations-repository';

/** Everything the knowledge graph is assembled from, read in a few bulk queries (task 7.03). */

export interface GraphData {
  concepts: {
    id: string;
    name: string;
    noteId: string | null;
    moduleIds: string[];
    topicIds: string[];
  }[];
  notes: {
    id: string;
    title: string;
    path: string;
    moduleCode: string | null;
    lectureKey: string | null;
  }[];
  /** Resolved links from notes, one row per (note, target) with how many times it links. */
  links: {
    fromNote: string;
    kind: 'note' | 'concept' | 'attachment';
    target: string;
    count: number;
  }[];
  sources: { id: string; title: string; path: string; moduleCode: string | null }[];
  lectures: { id: string; moduleId: string; key: string; title: string }[];
  lectureSources: { lectureId: string; sourceId: string }[];
  modules: { id: string; code: string; title: string }[];
  topics: { id: string; moduleId: string; parentId: string | null; title: string }[];
  relations: ReturnType<RelationsRepository['all']>;
}

type Raw = Record<string, unknown>;

const list = (value: unknown): string[] =>
  typeof value === 'string' && value !== '' ? (JSON.parse(value) as string[]) : [];
const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export type GraphRepository = ReturnType<typeof createGraphRepository>;

export function createGraphRepository(db: SqlDatabase, relations: RelationsRepository) {
  return {
    read(): GraphData {
      return db.transaction(() => ({
        concepts: db
          .all<Raw>(
            `SELECT c.id, c.name, c.note_id,
               (SELECT json_group_array(module_id) FROM concept_modules WHERE concept_id = c.id) AS module_ids,
               (SELECT json_group_array(topic_id) FROM concept_topics WHERE concept_id = c.id) AS topic_ids
             FROM concepts c WHERE c.status = 'active' ORDER BY c.id`,
          )
          .map((raw) => ({
            id: String(raw.id),
            name: String(raw.name),
            noteId: text(raw.note_id),
            moduleIds: list(raw.module_ids),
            topicIds: list(raw.topic_ids),
          })),
        notes: db
          .all<Raw>('SELECT id, title, path, module_code, lecture_key FROM notes ORDER BY id')
          .map((raw) => ({
            id: String(raw.id),
            title: String(raw.title),
            path: String(raw.path),
            moduleCode: text(raw.module_code),
            lectureKey: text(raw.lecture_key),
          })),
        links: db
          .all<Raw>(
            `SELECT n.id AS from_note, l.target_kind AS kind,
               coalesce(t.id, l.target_concept, l.target_path) AS target, count(*) AS count
             FROM note_links l
             JOIN notes n ON n.doc_id = l.source_doc
             LEFT JOIN notes t ON t.doc_id = l.target_doc
             WHERE l.target_kind IN ('note', 'concept', 'attachment')
               AND coalesce(t.id, l.target_concept, l.target_path) IS NOT NULL
             GROUP BY n.id, l.target_kind, target
             ORDER BY n.id, target`,
          )
          .map((raw) => ({
            fromNote: String(raw.from_note),
            kind: raw.kind as 'note' | 'concept' | 'attachment',
            target: String(raw.target),
            count: Number(raw.count),
          })),
        sources: db
          .all<Raw>(
            `SELECT id, title, path, module_code FROM sources
             WHERE deleted_at IS NULL AND missing_at IS NULL ORDER BY id`,
          )
          .map((raw) => ({
            id: String(raw.id),
            title: String(raw.title),
            path: String(raw.path),
            moduleCode: text(raw.module_code),
          })),
        lectures: db
          .all<Raw>('SELECT id, module_id, key, title FROM lectures ORDER BY id')
          .map((raw) => ({
            id: String(raw.id),
            moduleId: String(raw.module_id),
            key: String(raw.key),
            title: String(raw.title),
          })),
        lectureSources: db
          .all<Raw>(
            'SELECT lecture_id, source_id FROM lecture_sources ORDER BY lecture_id, source_id',
          )
          .map((raw) => ({ lectureId: String(raw.lecture_id), sourceId: String(raw.source_id) })),
        modules: db
          .all<Raw>('SELECT id, code, title FROM modules ORDER BY id')
          .map((raw) => ({ id: String(raw.id), code: String(raw.code), title: String(raw.title) })),
        topics: db
          .all<Raw>('SELECT id, module_id, parent_id, title FROM topics ORDER BY id')
          .map((raw) => ({
            id: String(raw.id),
            moduleId: String(raw.module_id),
            parentId: text(raw.parent_id),
            title: String(raw.title),
          })),
        relations: relations.all(['accepted', 'proposed']),
      }));
    },

    /** The community each node was last placed in (derived; migration 0007). */
    previousCommunities(): Map<string, number> {
      return new Map(
        db
          .all<Raw>('SELECT node_id, community FROM graph_communities')
          .map((raw) => [String(raw.node_id), Number(raw.community)]),
      );
    },

    saveCommunities(assignment: ReadonlyMap<string, number>): void {
      db.transaction(() => {
        db.run('DELETE FROM graph_communities');
        for (const [nodeId, community] of assignment)
          db.run('INSERT INTO graph_communities (node_id, community) VALUES (?, ?)', [
            nodeId,
            community,
          ]);
      });
    },
  };
}
