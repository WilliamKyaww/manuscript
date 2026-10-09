import type { Confidence, GraphNodeType, RelationStatus, StoredRelation } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for stored relations (migration 0007) and the labels of the nodes they connect. */

export interface RelationRow {
  id: string;
  fromType: GraphNodeType;
  fromId: string;
  toType: GraphNodeType;
  toId: string;
  relation: StoredRelation;
  confidence: Confidence;
  score: number | null;
  status: RelationStatus;
  evidenceJson: string;
  createdBy: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
}

type Raw = Record<string, unknown>;

const toRow = (raw: Raw): RelationRow => ({
  id: String(raw.id),
  fromType: raw.from_type as GraphNodeType,
  fromId: String(raw.from_id),
  toType: raw.to_type as GraphNodeType,
  toId: String(raw.to_id),
  relation: raw.relation as StoredRelation,
  confidence: raw.confidence as Confidence,
  score: raw.score === null ? null : Number(raw.score),
  status: raw.status as RelationStatus,
  evidenceJson: String(raw.evidence_json),
  createdBy: raw.created_by as 'user' | 'ai',
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

/** How each node type is named: lectures and modules carry their key or code. */
const LABEL_QUERIES: Record<GraphNodeType, string> = {
  concept: `SELECT id, name AS label FROM concepts WHERE id IN (SELECT value FROM json_each(?))`,
  note: `SELECT id, title AS label FROM notes WHERE id IN (SELECT value FROM json_each(?))`,
  source: `SELECT id, title AS label FROM sources
           WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
  lecture: `SELECT l.id, m.code || '/' || l.key || ' ' || l.title AS label FROM lectures l
            JOIN modules m ON m.id = l.module_id WHERE l.id IN (SELECT value FROM json_each(?))`,
  module: `SELECT id, code || ' ' || title AS label FROM modules WHERE id IN (SELECT value FROM json_each(?))`,
  topic: `SELECT id, title AS label FROM topics WHERE id IN (SELECT value FROM json_each(?))`,
};

export type RelationsRepository = ReturnType<typeof createRelationsRepository>;

export function createRelationsRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    byId(id: string): RelationRow | null {
      const raw = db.get<Raw>('SELECT * FROM relations WHERE id = ?', [id]);
      return raw ? toRow(raw) : null;
    },

    find(fromId: string, toId: string, relation: StoredRelation): RelationRow | null {
      const raw = db.get<Raw>(
        'SELECT * FROM relations WHERE from_id = ? AND to_id = ? AND relation = ?',
        [fromId, toId, relation],
      );
      return raw ? toRow(raw) : null;
    },

    /** Relations starting or ending at a node, newest first. */
    forNode(nodeId: string, statuses: readonly RelationStatus[]): RelationRow[] {
      return db
        .all<Raw>(
          `SELECT * FROM relations WHERE (from_id = ? OR to_id = ?)
             AND status IN (SELECT value FROM json_each(?))
           ORDER BY created_at DESC, id DESC`,
          [nodeId, nodeId, JSON.stringify(statuses)],
        )
        .map(toRow);
    },

    /** Every relation with one of these statuses, in a stable order. */
    all(statuses: readonly RelationStatus[]): RelationRow[] {
      return db
        .all<Raw>(
          'SELECT * FROM relations WHERE status IN (SELECT value FROM json_each(?)) ORDER BY id',
          [JSON.stringify(statuses)],
        )
        .map(toRow);
    },

    insert(row: RelationRow): void {
      db.run(
        `INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation, confidence, score,
           status, evidence_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.fromType,
          row.fromId,
          row.toType,
          row.toId,
          row.relation,
          row.confidence,
          row.score,
          row.status,
          row.evidenceJson,
          row.createdBy,
          row.createdAt,
          row.updatedAt,
        ],
      );
    },

    update(row: RelationRow): void {
      db.run(
        `UPDATE relations SET from_id = ?, to_id = ?, from_type = ?, to_type = ?, relation = ?,
           confidence = ?, score = ?, status = ?, evidence_json = ?, updated_at = ? WHERE id = ?`,
        [
          row.fromId,
          row.toId,
          row.fromType,
          row.toType,
          row.relation,
          row.confidence,
          row.score,
          row.status,
          row.evidenceJson,
          row.updatedAt,
          row.id,
        ],
      );
    },

    remove(id: string): void {
      db.run('DELETE FROM relations WHERE id = ?', [id]);
    },

    /** Labels of the nodes that exist among `ids`, grouped by type by the caller. */
    labels(type: GraphNodeType, ids: readonly string[]): Map<string, string> {
      if (ids.length === 0) return new Map();
      return new Map(
        db
          .all<Raw>(LABEL_QUERIES[type], [JSON.stringify(ids)])
          .map((raw) => [String(raw.id), String(raw.label)]),
      );
    },
  };
}
