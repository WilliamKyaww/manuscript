import type { CodeEdgeInput, CodeEntityInput, CodeLinkStatus } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for imported code graphs and their links to concepts (migration 0016). */

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

export interface GraphRow {
  id: string;
  name: string;
  moduleId: string | null;
  moduleCode: string | null;
  moduleTitle: string | null;
  fileName: string;
  sha256: string;
  entities: number;
  edges: number;
  proposed: number;
  accepted: number;
  importedAt: string;
}

export interface EntityRow {
  id: string;
  graphId: string;
  graphName: string;
  key: string;
  label: string;
  kind: string;
  file: string | null;
  location: string | null;
  rationale: string | null;
}

export interface LinkRow {
  conceptId: string;
  entityId: string;
  status: CodeLinkStatus;
  score: number | null;
  reason: string;
  createdBy: 'user' | 'system';
}

const toGraph = (raw: Raw): GraphRow => ({
  id: String(raw.id),
  name: String(raw.name),
  moduleId: text(raw.module_id),
  moduleCode: text(raw.module_code),
  moduleTitle: text(raw.module_title),
  fileName: String(raw.file_name),
  sha256: String(raw.sha256),
  entities: Number(raw.entity_count),
  edges: Number(raw.edge_count),
  proposed: Number(raw.proposed ?? 0),
  accepted: Number(raw.accepted ?? 0),
  importedAt: String(raw.imported_at),
});

const toEntity = (raw: Raw): EntityRow => ({
  id: String(raw.id),
  graphId: String(raw.graph_id),
  graphName: String(raw.graph_name),
  key: String(raw.key),
  label: String(raw.label),
  kind: String(raw.kind),
  file: text(raw.file),
  location: text(raw.location),
  rationale: text(raw.rationale),
});

const toLink = (raw: Raw): LinkRow => ({
  conceptId: String(raw.concept_id),
  entityId: String(raw.entity_id),
  status: raw.status as CodeLinkStatus,
  score: raw.score === null ? null : Number(raw.score),
  reason: String(raw.reason),
  createdBy: raw.created_by as 'user' | 'system',
});

const GRAPH_SELECT = `
  SELECT g.*, m.code AS module_code, m.title AS module_title,
    (SELECT count(*) FROM code_links l JOIN code_entities e ON e.id = l.entity_id
       WHERE e.graph_id = g.id AND l.status = 'proposed') AS proposed,
    (SELECT count(*) FROM code_links l JOIN code_entities e ON e.id = l.entity_id
       WHERE e.graph_id = g.id AND l.status = 'accepted') AS accepted
  FROM code_graphs g LEFT JOIN modules m ON m.id = g.module_id`;

const ENTITY_SELECT = `
  SELECT e.id, e.graph_id, g.name AS graph_name, e.key, e.label, e.kind, e.file, e.location, e.rationale
  FROM code_entities e JOIN code_graphs g ON g.id = e.graph_id`;

export type CodeRepository = ReturnType<typeof createCodeRepository>;

export function createCodeRepository(db: SqlDatabase) {
  return {
    graphs(): GraphRow[] {
      return db.all<Raw>(`${GRAPH_SELECT} ORDER BY g.imported_at DESC, g.id`).map(toGraph);
    },

    graph(id: string): GraphRow | null {
      const raw = db.get<Raw>(`${GRAPH_SELECT} WHERE g.id = ?`, [id]);
      return raw ? toGraph(raw) : null;
    },

    graphBySha(sha256: string): GraphRow | null {
      const raw = db.get<Raw>(`${GRAPH_SELECT} WHERE g.sha256 = ?`, [sha256]);
      return raw ? toGraph(raw) : null;
    },

    /** One transaction: the graph, its entities and edges, ids made by the caller. */
    insertGraph(input: {
      id: string;
      name: string;
      moduleId: string | null;
      fileName: string;
      sha256: string;
      importedAt: string;
      entities: (CodeEntityInput & { id: string })[];
      edges: CodeEdgeInput[];
    }): void {
      db.transaction(() => {
        db.run(
          `INSERT INTO code_graphs (id, name, module_id, file_name, sha256, entity_count, edge_count, imported_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.id,
            input.name,
            input.moduleId,
            input.fileName,
            input.sha256,
            input.entities.length,
            input.edges.length,
            input.importedAt,
          ],
        );
        const idOf = new Map<string, string>();
        for (const entity of input.entities) {
          idOf.set(entity.key, entity.id);
          db.run(
            `INSERT INTO code_entities (id, graph_id, key, label, kind, file, location, rationale)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entity.id,
              input.id,
              entity.key,
              entity.label,
              entity.kind,
              entity.file,
              entity.location,
              entity.rationale,
            ],
          );
        }
        for (const edge of input.edges) {
          db.run(
            `INSERT INTO code_edges (graph_id, source_id, target_id, relation, confidence, score, weight)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              input.id,
              idOf.get(edge.source) as string,
              idOf.get(edge.target) as string,
              edge.relation,
              edge.confidence,
              edge.score,
              edge.weight,
            ],
          );
        }
      });
    },

    update(id: string, changes: { name?: string; moduleId?: string | null }): void {
      if (changes.name !== undefined)
        db.run('UPDATE code_graphs SET name = ? WHERE id = ?', [changes.name, id]);
      if (changes.moduleId !== undefined)
        db.run('UPDATE code_graphs SET module_id = ? WHERE id = ?', [changes.moduleId, id]);
    },

    deleteGraph(id: string): void {
      db.run('DELETE FROM code_graphs WHERE id = ?', [id]);
    },

    entitiesOf(graphId: string): EntityRow[] {
      return db
        .all<Raw>(`${ENTITY_SELECT} WHERE e.graph_id = ? ORDER BY e.id`, [graphId])
        .map(toEntity);
    },

    /** How many edges touch each entity, for ranking matches. */
    degrees(graphId: string): Map<string, number> {
      const counts = new Map<string, number>();
      for (const raw of db.all<Raw>(
        `SELECT id, sum(n) AS n FROM (
           SELECT source_id AS id, count(*) AS n FROM code_edges WHERE graph_id = ? GROUP BY source_id
           UNION ALL
           SELECT target_id AS id, count(*) AS n FROM code_edges WHERE graph_id = ? GROUP BY target_id
         ) GROUP BY id`,
        [graphId, graphId],
      ))
        counts.set(String(raw.id), Number(raw.n));
      return counts;
    },

    entity(id: string): EntityRow | null {
      const raw = db.get<Raw>(`${ENTITY_SELECT} WHERE e.id = ?`, [id]);
      return raw ? toEntity(raw) : null;
    },

    search(filter: { q?: string; graphId?: string; kind?: string; limit: number }): {
      rows: EntityRow[];
      total: number;
    } {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.graphId) {
        where.push('e.graph_id = ?');
        params.push(filter.graphId);
      }
      if (filter.kind) {
        where.push('e.kind = ?');
        params.push(filter.kind);
      }
      if (filter.q) {
        where.push("(e.label LIKE ? ESCAPE '\\' OR e.file LIKE ? ESCAPE '\\')");
        const like = `%${filter.q.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
        params.push(like, like);
      }
      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const total = Number(
        db.get<Raw>(`SELECT count(*) AS n FROM code_entities e ${clause}`, params)?.n ?? 0,
      );
      const rows = db
        .all<Raw>(`${ENTITY_SELECT} ${clause} ORDER BY e.label, e.id LIMIT ?`, [
          ...params,
          filter.limit,
        ])
        .map(toEntity);
      return { rows, total };
    },

    edgesOf(entityId: string): {
      direction: 'out' | 'in';
      relation: string;
      confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
      other: { id: string; label: string; kind: string };
    }[] {
      const out = db.all<Raw>(
        `SELECT d.relation, d.confidence, o.id, o.label, o.kind FROM code_edges d
         JOIN code_entities o ON o.id = d.target_id WHERE d.source_id = ? ORDER BY d.relation, o.label`,
        [entityId],
      );
      const into = db.all<Raw>(
        `SELECT d.relation, d.confidence, o.id, o.label, o.kind FROM code_edges d
         JOIN code_entities o ON o.id = d.source_id WHERE d.target_id = ? ORDER BY d.relation, o.label`,
        [entityId],
      );
      const shape = (direction: 'out' | 'in') => (raw: Raw) => ({
        direction,
        relation: String(raw.relation),
        confidence: raw.confidence as 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS',
        other: { id: String(raw.id), label: String(raw.label), kind: String(raw.kind) },
      });
      return [...out.map(shape('out')), ...into.map(shape('in'))];
    },

    /** Every edge of every graph, for assembling the knowledge graph. */
    allEdges(): {
      id: number;
      sourceId: string;
      targetId: string;
      relation: string;
      confidence: string;
      score: number | null;
      weight: number;
    }[] {
      return db
        .all<Raw>(
          'SELECT id, source_id, target_id, relation, confidence, score, weight FROM code_edges ORDER BY id',
        )
        .map((raw) => ({
          id: Number(raw.id),
          sourceId: String(raw.source_id),
          targetId: String(raw.target_id),
          relation: String(raw.relation),
          confidence: String(raw.confidence),
          score: raw.score === null ? null : Number(raw.score),
          weight: Number(raw.weight),
        }));
    },

    allEntities(): {
      id: string;
      label: string;
      kind: string;
      file: string | null;
      moduleId: string | null;
    }[] {
      return db
        .all<Raw>(
          `SELECT e.id, e.label, e.kind, e.file, g.module_id FROM code_entities e
           JOIN code_graphs g ON g.id = e.graph_id ORDER BY e.id`,
        )
        .map((raw) => ({
          id: String(raw.id),
          label: String(raw.label),
          kind: String(raw.kind),
          file: text(raw.file),
          moduleId: text(raw.module_id),
        }));
    },

    allLinks(): LinkRow[] {
      return db
        .all<Raw>(
          "SELECT * FROM code_links WHERE status <> 'rejected' ORDER BY concept_id, entity_id",
        )
        .map(toLink);
    },

    linksOfConcept(conceptId: string): (LinkRow & { entity: EntityRow })[] {
      return db
        .all<Raw>(
          `SELECT l.concept_id, l.entity_id, l.status, l.score, l.reason, l.created_by,
             e.id, e.graph_id, g.name AS graph_name, e.key, e.label, e.kind, e.file, e.location, e.rationale
           FROM code_links l
           JOIN code_entities e ON e.id = l.entity_id
           JOIN code_graphs g ON g.id = e.graph_id
           WHERE l.concept_id = ? AND l.status <> 'rejected'
           ORDER BY CASE l.status WHEN 'accepted' THEN 0 ELSE 1 END, l.score DESC, e.label`,
          [conceptId],
        )
        .map((raw) => ({ ...toLink(raw), entity: toEntity(raw) }));
    },

    linksOfEntity(
      entityId: string,
    ): { conceptId: string; name: string; status: CodeLinkStatus; reason: string }[] {
      return db
        .all<Raw>(
          `SELECT l.concept_id, c.name, l.status, l.reason FROM code_links l
           JOIN concepts c ON c.id = l.concept_id
           WHERE l.entity_id = ? AND l.status <> 'rejected' AND c.status = 'active'
           ORDER BY c.name`,
          [entityId],
        )
        .map((raw) => ({
          conceptId: String(raw.concept_id),
          name: String(raw.name),
          status: raw.status as CodeLinkStatus,
          reason: String(raw.reason),
        }));
    },

    link(conceptId: string, entityId: string): LinkRow | null {
      const raw = db.get<Raw>('SELECT * FROM code_links WHERE concept_id = ? AND entity_id = ?', [
        conceptId,
        entityId,
      ]);
      return raw ? toLink(raw) : null;
    },

    /** Adds a link unless the pair already has one (a decision is never overwritten by a match). */
    insertLinkIfNew(row: LinkRow & { at: string }): boolean {
      const result = db.run(
        `INSERT OR IGNORE INTO code_links
           (concept_id, entity_id, status, score, reason, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.conceptId,
          row.entityId,
          row.status,
          row.score,
          row.reason,
          row.createdBy,
          row.at,
          row.at,
        ],
      );
      return Number(result.changes) > 0;
    },

    setLink(row: LinkRow & { at: string }): void {
      db.run(
        `INSERT INTO code_links
           (concept_id, entity_id, status, score, reason, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (concept_id, entity_id) DO UPDATE SET status = excluded.status,
           reason = excluded.reason, updated_at = excluded.updated_at`,
        [
          row.conceptId,
          row.entityId,
          row.status,
          row.score,
          row.reason,
          row.createdBy,
          row.at,
          row.at,
        ],
      );
    },

    deleteLink(conceptId: string, entityId: string): void {
      db.run('DELETE FROM code_links WHERE concept_id = ? AND entity_id = ?', [
        conceptId,
        entityId,
      ]);
    },
  };
}
