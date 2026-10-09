import {
  ConflictError,
  type GraphNodeType,
  type IdFactory,
  NotFoundError,
  nodeType,
  RELATIONS,
  type Relation,
  type RelationInputSchema,
  type RelationStatus,
  type RelationUpdateSchema,
  relationProblem,
  type StoredRelation,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { NoteIndexer } from '../notes/indexer';
import type { RelationRow, RelationsRepository } from './relations-repository';

/**
 * Stored relations (task 7.02, ADR-0020): typed edges with a confidence, a status and evidence.
 * What the student adds is USER and accepted; AI proposals (Phase 11) arrive as proposed. Symmetric
 * relations are stored once, smaller id first; a relation and its reverse cannot both be stated.
 */

type RelationInput = z.output<typeof RelationInputSchema>;
type RelationUpdate = z.output<typeof RelationUpdateSchema>;

export interface RelationsDependencies {
  repo: RelationsRepository;
  indexer: NoteIndexer;
  events: EventBus;
  clock: Clock;
  ids: IdFactory;
}

const VISIBLE: RelationStatus[] = ['accepted', 'proposed'];

export function createRelationsService(deps: RelationsDependencies) {
  const { repo, indexer, events, clock, ids } = deps;
  const now = () => clock.now().toISOString();
  const changed = () => events.publish({ type: 'data.changed', area: 'relations' });

  const label = (type: GraphNodeType, id: string) => repo.labels(type, [id]).get(id);

  const toRelation = (row: RelationRow, labels?: Map<string, string>): Relation => ({
    id: row.id as Relation['id'],
    from: {
      type: row.fromType,
      id: row.fromId,
      label: labels?.get(row.fromId) ?? label(row.fromType, row.fromId) ?? '(missing)',
    },
    to: {
      type: row.toType,
      id: row.toId,
      label: labels?.get(row.toId) ?? label(row.toType, row.toId) ?? '(missing)',
    },
    relation: row.relation,
    confidence: row.confidence,
    score: row.score,
    status: row.status,
    evidence: JSON.parse(row.evidenceJson) as Relation['evidence'],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const requireRow = (id: string): RelationRow => {
    const row = repo.byId(id);
    if (!row) throw new NotFoundError('That relation does not exist.');
    return row;
  };

  /** Checks a relation's ends and returns them in storage order. */
  const ends = (
    relation: StoredRelation,
    fromId: string,
    toId: string,
    exceptId: string | null,
  ) => {
    if (fromId === toId) throw new ValidationError('A relation needs two different ends.');
    const fromType = nodeType(fromId);
    const toType = nodeType(toId);
    const problem = relationProblem(relation, fromType, toType);
    if (problem) throw new ValidationError(problem);
    for (const [type, id] of [
      [fromType, fromId],
      [toType, toId],
    ] as const) {
      if (label(type, id) === undefined) throw new ValidationError(`That ${type} does not exist.`);
    }
    const swap = RELATIONS[relation].symmetric && toId < fromId;
    const ordered = swap
      ? { fromType: toType, fromId: toId, toType: fromType, toId: fromId }
      : { fromType, fromId, toType, toId };
    const same = repo.find(ordered.fromId, ordered.toId, relation);
    if (same && same.id !== exceptId)
      throw new ConflictError('These two are already connected by that relation.');
    if (!RELATIONS[relation].symmetric) {
      const reverse = repo.find(ordered.toId, ordered.fromId, relation);
      if (reverse && reverse.id !== exceptId)
        throw new ConflictError(
          'The reverse relation is already stated; a relation and its reverse cannot both hold.',
        );
    }
    // Relations refer to notes by id, so a note's id is saved into its file (ADR-0025).
    for (const [type, id] of [
      [ordered.fromType, ordered.fromId],
      [ordered.toType, ordered.toId],
    ] as const) {
      if (type === 'note') indexer.ensurePersistentId(id);
    }
    return ordered;
  };

  return {
    /** Accepted and proposed relations of a node (rejected ones only when asked for). */
    listFor(nodeId: string, statuses: readonly RelationStatus[] = VISIBLE): Relation[] {
      const rows = repo.forNode(nodeId, statuses);
      const labels = new Map<string, string>();
      const byType = new Map<GraphNodeType, Set<string>>();
      for (const row of rows) {
        for (const [type, id] of [
          [row.fromType, row.fromId],
          [row.toType, row.toId],
        ] as const) {
          byType.set(type, (byType.get(type) ?? new Set()).add(id));
        }
      }
      for (const [type, idSet] of byType)
        for (const [id, text] of repo.labels(type, [...idSet])) labels.set(id, text);
      return rows.map((row) => toRelation(row, labels));
    },

    get: (id: string): Relation => toRelation(requireRow(id)),

    create(input: RelationInput, createdBy: 'user' | 'ai' = 'user'): Relation {
      const id = ids('relation');
      repo.transaction(() => {
        const ordered = ends(input.relation, input.from, input.to, null);
        const confidence = input.confidence ?? (createdBy === 'user' ? 'USER' : 'INFERRED');
        repo.insert({
          id,
          ...ordered,
          relation: input.relation,
          confidence,
          score: input.score ?? null,
          status: input.status ?? (createdBy === 'user' ? 'accepted' : 'proposed'),
          evidenceJson: JSON.stringify(input.evidence ?? []),
          createdBy,
          createdAt: now(),
          updatedAt: now(),
        });
      });
      changed();
      return toRelation(requireRow(id));
    },

    update(id: string, input: RelationUpdate): Relation {
      const current = requireRow(id);
      repo.transaction(() => {
        const relation = input.relation ?? current.relation;
        const ordered =
          relation === current.relation
            ? {
                fromType: current.fromType,
                fromId: current.fromId,
                toType: current.toType,
                toId: current.toId,
              }
            : ends(relation, current.fromId, current.toId, id);
        repo.update({
          ...current,
          ...ordered,
          relation,
          confidence: input.confidence ?? current.confidence,
          score: input.score !== undefined ? input.score : current.score,
          status: input.status ?? current.status,
          evidenceJson:
            input.evidence !== undefined ? JSON.stringify(input.evidence) : current.evidenceJson,
          updatedAt: now(),
        });
      });
      changed();
      return toRelation(requireRow(id));
    },

    remove(id: string): void {
      requireRow(id);
      repo.remove(id);
      changed();
    },
  };
}

export type RelationsService = ReturnType<typeof createRelationsService>;
