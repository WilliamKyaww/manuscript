import { RELATIONS } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/**
 * SQL for merging one concept into another (agent tool `merge_concepts`, Phase 12). Everything that
 * pointed at the merged concept is redirected to the kept one, its name and aliases become aliases
 * of the kept concept (so `[[links]]` keep resolving), and the merged concept is deleted. What was
 * changed is returned as a snapshot with which `restore` puts everything back.
 */

type Row = Record<string, string | number | null>;

export interface MergeSnapshot {
  keepId: string;
  /** The merged concept's row, as it was. */
  concept: Row;
  aliases: { alias: string; alias_key: string }[];
  modules: string[];
  topics: string[];
  cards: string[];
  questions: string[];
  /** Every relation that touched the merged concept, as it was. */
  relations: Row[];
  /** What the kept concept gained, which restoring takes away again. */
  added: {
    aliasKeys: string[];
    modules: string[];
    topics: string[];
    cards: string[];
    questions: string[];
    adoptedNote: boolean;
    adoptedSummary: boolean;
  };
}

const CONCEPT_COLUMNS = [
  'id',
  'name',
  'name_key',
  'slug',
  'summary',
  'note_id',
  'status',
  'merged_into',
  'importance',
  'created_by',
  'created_at',
  'updated_at',
] as const;
const RELATION_COLUMNS = [
  'id',
  'from_type',
  'from_id',
  'to_type',
  'to_id',
  'relation',
  'confidence',
  'score',
  'weight',
  'status',
  'evidence_json',
  'created_by',
  'created_at',
  'updated_at',
] as const;

const SYMMETRIC = new Set(
  Object.entries(RELATIONS)
    .filter(([, definition]) => definition.symmetric)
    .map(([name]) => name),
);

export type ConceptMergeRepository = ReturnType<typeof createConceptMergeRepository>;

export function createConceptMergeRepository(db: SqlDatabase) {
  const column = (sql: string, params: (string | number)[], name: string) =>
    db.all<Row>(sql, params).map((row) => String(row[name]));

  function insertRow(table: string, columns: readonly string[], row: Row) {
    db.run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((name) => row[name] ?? null),
    );
  }

  /** Moves the kept side's rows of a link table (card, question, module, topic) over. */
  function redirectLinks(
    table: string,
    owner: string,
    loserId: string,
    keepId: string,
  ): { moved: string[]; added: string[] } {
    const moved = column(
      `SELECT ${owner} AS id FROM ${table} WHERE concept_id = ?`,
      [loserId],
      'id',
    );
    const had = new Set(
      column(`SELECT ${owner} AS id FROM ${table} WHERE concept_id = ?`, [keepId], 'id'),
    );
    const added: string[] = [];
    for (const id of moved) {
      if (had.has(id)) continue;
      db.run(`INSERT INTO ${table} (concept_id, ${owner}) VALUES (?, ?)`, [keepId, id]);
      added.push(id);
    }
    return { moved, added };
  }

  return {
    merge(loserId: string, keepId: string, at: string): MergeSnapshot {
      const concept = db.get<Row>('SELECT * FROM concepts WHERE id = ?', [loserId]) as Row;
      const keep = db.get<Row>('SELECT * FROM concepts WHERE id = ?', [keepId]) as Row;
      const aliases = db.all<Row>(
        'SELECT alias, alias_key FROM concept_aliases WHERE concept_id = ?',
        [loserId],
      ) as unknown as MergeSnapshot['aliases'];
      const relations = db.all<Row>('SELECT * FROM relations WHERE from_id = ? OR to_id = ?', [
        loserId,
        loserId,
      ]);

      // Names: the merged concept's name and aliases now belong to the kept concept.
      const aliasKeys: string[] = [];
      for (const entry of [
        { alias: String(concept.name), alias_key: String(concept.name_key) },
        ...aliases,
      ]) {
        db.run('DELETE FROM concept_aliases WHERE concept_id = ? AND alias_key = ?', [
          loserId,
          entry.alias_key,
        ]);
        db.run('INSERT INTO concept_aliases (concept_id, alias, alias_key) VALUES (?, ?, ?)', [
          keepId,
          entry.alias,
          entry.alias_key,
        ]);
        aliasKeys.push(entry.alias_key);
      }

      const modules = redirectLinks('concept_modules', 'module_id', loserId, keepId);
      const topics = redirectLinks('concept_topics', 'topic_id', loserId, keepId);
      const cards = redirectLinks('card_concepts', 'card_id', loserId, keepId);
      const questions = redirectLinks('question_concepts', 'question_id', loserId, keepId);

      // Relations: point them at the kept concept, dropping any that would repeat one, loop back
      // on the concept, or contradict one (a relation and its reverse cannot both hold).
      for (const relation of relations) {
        let fromType = relation.from_type;
        let fromId = String(relation.from_id);
        let toType = relation.to_type;
        let toId = String(relation.to_id);
        if (fromId === loserId) fromId = keepId;
        if (toId === loserId) toId = keepId;
        const name = String(relation.relation);
        const drop = () => db.run('DELETE FROM relations WHERE id = ?', [String(relation.id)]);
        if (fromId === toId) {
          drop();
          continue;
        }
        if (SYMMETRIC.has(name) && toId < fromId) {
          [fromId, toId] = [toId, fromId];
          [fromType, toType] = [toType, fromType];
        }
        const same = db.get(
          'SELECT 1 FROM relations WHERE from_id = ? AND to_id = ? AND relation = ? AND id <> ?',
          [fromId, toId, name, String(relation.id)],
        );
        const reverse = SYMMETRIC.has(name)
          ? undefined
          : db.get(
              'SELECT 1 FROM relations WHERE from_id = ? AND to_id = ? AND relation = ? AND id <> ?',
              [toId, fromId, name, String(relation.id)],
            );
        if (same || reverse) {
          drop();
          continue;
        }
        db.run(
          'UPDATE relations SET from_type = ?, from_id = ?, to_type = ?, to_id = ?, updated_at = ? WHERE id = ?',
          [String(fromType), fromId, String(toType), toId, at, String(relation.id)],
        );
      }

      // The kept concept adopts a backing note and a summary it lacked.
      const adoptedNote = keep.note_id === null && concept.note_id !== null;
      const adoptedSummary =
        String(keep.summary ?? '') === '' && String(concept.summary ?? '') !== '';
      db.run(
        `UPDATE concepts SET note_id = coalesce(note_id, ?),
           summary = CASE WHEN summary = '' THEN ? ELSE summary END, updated_at = ? WHERE id = ?`,
        [concept.note_id ?? null, String(concept.summary ?? ''), at, keepId],
      );

      db.run('DELETE FROM concepts WHERE id = ?', [loserId]);
      return {
        keepId,
        concept,
        aliases,
        modules: modules.moved,
        topics: topics.moved,
        cards: cards.moved,
        questions: questions.moved,
        relations,
        added: {
          aliasKeys,
          modules: modules.added,
          topics: topics.added,
          cards: cards.added,
          questions: questions.added,
          adoptedNote,
          adoptedSummary,
        },
      };
    },

    /** Puts everything back as the snapshot says. */
    restore(snapshot: MergeSnapshot, at: string): void {
      const loserId = String(snapshot.concept.id);
      const keepId = snapshot.keepId;
      insertRow('concepts', CONCEPT_COLUMNS, snapshot.concept);
      for (const key of snapshot.added.aliasKeys)
        db.run('DELETE FROM concept_aliases WHERE concept_id = ? AND alias_key = ?', [keepId, key]);
      for (const entry of snapshot.aliases)
        db.run('INSERT INTO concept_aliases (concept_id, alias, alias_key) VALUES (?, ?, ?)', [
          loserId,
          entry.alias,
          entry.alias_key,
        ]);
      const links: [string, string, string[], string[]][] = [
        ['concept_modules', 'module_id', snapshot.modules, snapshot.added.modules],
        ['concept_topics', 'topic_id', snapshot.topics, snapshot.added.topics],
        ['card_concepts', 'card_id', snapshot.cards, snapshot.added.cards],
        ['question_concepts', 'question_id', snapshot.questions, snapshot.added.questions],
      ];
      for (const [table, owner, all, added] of links) {
        for (const id of added)
          db.run(`DELETE FROM ${table} WHERE concept_id = ? AND ${owner} = ?`, [keepId, id]);
        for (const id of all)
          db.run(`INSERT OR IGNORE INTO ${table} (concept_id, ${owner}) VALUES (?, ?)`, [
            loserId,
            id,
          ]);
      }
      for (const relation of snapshot.relations) {
        db.run('DELETE FROM relations WHERE id = ?', [relation.id as string]);
        insertRow('relations', RELATION_COLUMNS, relation);
      }
      db.run(
        `UPDATE concepts SET
           note_id = CASE WHEN ? = 1 AND note_id IS ? THEN NULL ELSE note_id END,
           summary = CASE WHEN ? = 1 AND summary IS ? THEN '' ELSE summary END,
           updated_at = ? WHERE id = ?`,
        [
          snapshot.added.adoptedNote ? 1 : 0,
          snapshot.concept.note_id ?? null,
          snapshot.added.adoptedSummary ? 1 : 0,
          String(snapshot.concept.summary ?? ''),
          at,
          keepId,
        ],
      );
    },
  };
}
