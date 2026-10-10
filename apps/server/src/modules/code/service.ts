import { createHash } from 'node:crypto';
import {
  type CodeEntity,
  type CodeGraph,
  type CodeImportResult,
  type CodeLink,
  ConflictError,
  type IdFactory,
  MAX_CODE_GRAPH_BYTES,
  matchConcepts,
  NotFoundError,
  parseGraphify,
  ValidationError,
} from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { ConceptsService } from '../concepts/service';
import type { CodeRepository, EntityRow, GraphRow, LinkRow } from './repository';

/**
 * Code graphs (task 16.06): importing a Graphify `graph.json`, proposing which concepts the code is
 * about from names, and recording what the student decides. Nothing here calls a model.
 */

export interface CodeDependencies {
  db: SqlDatabase;
  repo: CodeRepository;
  concepts: ConceptsService;
  events: EventBus;
  clock: Clock;
  ids: IdFactory;
}

export type CodeService = ReturnType<typeof createCodeService>;

const toGraph = (row: GraphRow): CodeGraph => ({
  id: row.id as CodeGraph['id'],
  name: row.name,
  fileName: row.fileName,
  module:
    row.moduleId && row.moduleCode
      ? {
          id: row.moduleId as never,
          code: row.moduleCode,
          title: row.moduleTitle ?? row.moduleCode,
        }
      : null,
  entities: row.entities,
  edges: row.edges,
  links: { proposed: row.proposed, accepted: row.accepted },
  importedAt: row.importedAt,
});

const toEntity = (row: EntityRow): CodeEntity => ({
  id: row.id as CodeEntity['id'],
  graphId: row.graphId as CodeEntity['graphId'],
  graphName: row.graphName,
  label: row.label,
  kind: row.kind,
  file: row.file,
  location: row.location,
  rationale: row.rationale,
});

const toLink = (row: LinkRow, entity: EntityRow): CodeLink => ({
  entity: toEntity(entity),
  status: row.status,
  score: row.score,
  reason: row.reason,
  createdBy: row.createdBy,
});

export function createCodeService(deps: CodeDependencies) {
  const { db, repo, concepts, events, clock, ids } = deps;
  const changed = () => events.publish({ type: 'data.changed', area: 'code' });
  const now = () => clock.now().toISOString();

  const requireGraph = (id: string): GraphRow => {
    const row = repo.graph(id);
    if (!row) throw new NotFoundError('That code graph does not exist.');
    return row;
  };
  const requireEntity = (id: string): EntityRow => {
    const row = repo.entity(id);
    if (!row) throw new NotFoundError('That piece of code is not in any imported graph.');
    return row;
  };

  /** Proposes links for every concept the names fit; what was decided before stays decided. */
  function propose(graphId: string): number {
    const entities = repo.entitiesOf(graphId);
    const byKey = new Map(entities.map((entity) => [entity.key, entity]));
    const degreeById = repo.degrees(graphId);
    const degreeByKey = new Map(
      entities.map((entity) => [entity.key, degreeById.get(entity.id) ?? 0]),
    );
    const matches = matchConcepts(
      entities.map((entity) => ({ key: entity.key, label: entity.label, kind: entity.kind })),
      concepts.list().map((concept) => ({
        id: concept.id,
        name: concept.name,
        aliases: concept.aliases,
      })),
      degreeByKey,
    );
    let added = 0;
    const at = now();
    db.transaction(() => {
      for (const match of matches) {
        const entity = byKey.get(match.entityKey);
        if (!entity) continue;
        const inserted = repo.insertLinkIfNew({
          conceptId: match.conceptId,
          entityId: entity.id,
          status: 'proposed',
          score: match.score,
          reason: match.reason,
          createdBy: 'system',
          at,
        });
        if (inserted) added += 1;
      }
    });
    return added;
  }

  return {
    list: (): CodeGraph[] => repo.graphs().map(toGraph),

    importGraph(input: {
      fileName: string;
      bytes: Uint8Array;
      name?: string | null;
      moduleCode?: string | null;
    }): CodeImportResult {
      if (input.bytes.length > MAX_CODE_GRAPH_BYTES)
        throw new ValidationError(
          `That file is larger than ${MAX_CODE_GRAPH_BYTES / 1024 / 1024} MB. Map a smaller part of the repository.`,
        );
      const sha256 = createHash('sha256').update(input.bytes).digest('hex');
      const existing = repo.graphBySha(sha256);
      if (existing) return { graph: toGraph(existing), duplicate: true, droppedEdges: 0 };

      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(input.bytes).replace(/^﻿/u, ''));
      } catch {
        throw new ValidationError('That file is not valid JSON, so it cannot be a graph.json.');
      }
      const parsed = parseGraphify(json);

      let moduleId: string | null = null;
      if (input.moduleCode) {
        const row = db.get<{ id: string }>('SELECT id FROM modules WHERE lower(code) = lower(?)', [
          input.moduleCode,
        ]);
        if (!row)
          throw new ValidationError(`There is no module with the code ${input.moduleCode}.`);
        moduleId = row.id;
      }
      const stem = input.fileName.replace(/\.[^.]+$/u, '').trim();
      const name =
        input.name?.trim() || (stem !== '' && stem.toLowerCase() !== 'graph' ? stem : 'Code graph');
      const id = ids('codeGraph');
      repo.insertGraph({
        id,
        name,
        moduleId,
        fileName: input.fileName.slice(0, 200),
        sha256,
        importedAt: now(),
        entities: parsed.entities.map((entity) => ({ ...entity, id: ids('codeEntity') })),
        edges: parsed.edges,
      });
      propose(id);
      changed();
      return {
        graph: toGraph(requireGraph(id)),
        duplicate: false,
        droppedEdges: parsed.droppedEdges,
      };
    },

    update(
      id: string,
      changes: { name?: string | undefined; moduleId?: string | null | undefined },
    ) {
      requireGraph(id);
      const next: { name?: string; moduleId?: string | null } = {};
      if (changes.name !== undefined) next.name = changes.name;
      if (changes.moduleId !== undefined) {
        if (
          changes.moduleId !== null &&
          !db.get('SELECT 1 FROM modules WHERE id = ?', [changes.moduleId])
        )
          throw new NotFoundError('That module does not exist.');
        next.moduleId = changes.moduleId;
      }
      repo.update(id, next);
      changed();
      return toGraph(requireGraph(id));
    },

    remove(id: string): void {
      requireGraph(id);
      repo.deleteGraph(id);
      changed();
    },

    rematch(id: string): { proposed: number } {
      requireGraph(id);
      const proposed = propose(id);
      if (proposed > 0) changed();
      return { proposed };
    },

    search(filter: {
      q?: string | undefined;
      graph?: string | undefined;
      kind?: string | undefined;
      limit: number;
    }) {
      const { rows, total } = repo.search({
        ...(filter.q ? { q: filter.q } : {}),
        ...(filter.graph ? { graphId: filter.graph } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        limit: filter.limit,
      });
      return { entities: rows.map(toEntity), total };
    },

    entity(id: string) {
      const entity = requireEntity(id);
      return {
        entity: toEntity(entity),
        edges: repo.edgesOf(id).map((edge) => ({
          ...edge,
          other: { ...edge.other, id: edge.other.id as CodeEntity['id'] },
        })),
        concepts: repo.linksOfEntity(id).map((link) => ({
          id: link.conceptId as never,
          name: link.name,
          status: link.status,
          reason: link.reason,
        })),
      };
    },

    linksOfConcept(conceptId: string): { links: CodeLink[] } {
      concepts.get(conceptId);
      return { links: repo.linksOfConcept(conceptId).map((row) => toLink(row, row.entity)) };
    },

    link(conceptId: string, entityId: string): CodeLink {
      concepts.get(conceptId);
      const entity = requireEntity(entityId);
      const existing = repo.link(conceptId, entityId);
      if (existing?.status === 'accepted')
        throw new ConflictError('That code is already linked to this concept.');
      const row: LinkRow = {
        conceptId,
        entityId,
        status: 'accepted',
        score: null,
        reason: 'Chosen by you.',
        createdBy: 'user',
      };
      repo.setLink({ ...row, at: now() });
      changed();
      return toLink(row, entity);
    },

    decide(conceptId: string, entityId: string, status: 'accepted' | 'rejected'): CodeLink {
      const entity = requireEntity(entityId);
      const existing = repo.link(conceptId, entityId);
      if (!existing) throw new NotFoundError('There is no such link to decide on.');
      const row: LinkRow = {
        ...existing,
        status,
        reason: status === 'accepted' ? existing.reason : existing.reason,
      };
      repo.setLink({ ...row, at: now() });
      changed();
      return toLink(row, entity);
    },

    unlink(conceptId: string, entityId: string): void {
      if (!repo.link(conceptId, entityId)) throw new NotFoundError('There is no such link.');
      repo.deleteLink(conceptId, entityId);
      changed();
    },
  };
}
