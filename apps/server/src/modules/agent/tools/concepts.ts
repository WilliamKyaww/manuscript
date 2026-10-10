import {
  CONFIDENCES,
  EXTRACTED_RELATIONS,
  GraphFilterSchema,
  idSchema,
  NotFoundError,
  RELATIONS,
  ValidationError,
} from '@skb/core';
import { normaliseKey } from '@skb/core/markdown';
import { z } from 'zod';
import type { MergeSnapshot } from '../../concepts/merge-repository';
import { defineTool, type Json, type ToolContext } from '../types';
import { count } from './shared';

/**
 * Concept and graph tools (task 12.06): look concepts up, walk the graph, create concepts, suggest
 * relations (as Inbox proposals, never straight into the graph) and merge duplicates.
 */

const ConceptId = idSchema('concept');

/** A concept by id, or by its name or an alias. */
function findConcept(context: ToolContext, reference: string) {
  const concepts = context.services.concepts.list();
  const key = normaliseKey(reference);
  const found = concepts.find(
    (concept) =>
      concept.id === reference ||
      normaliseKey(concept.name) === key ||
      concept.aliases.some((alias) => normaliseKey(alias) === key),
  );
  if (!found) throw new NotFoundError(`There is no concept “${reference}”.`);
  return found;
}

export const getConcept = defineTool({
  name: 'get_concept',
  category: 'concepts',
  description:
    'Look up a concept by id, name or alias: its summary, aliases and the concepts it is related to, with how sure each relation is.',
  input: z.object({ concept: z.string().trim().min(1).max(200) }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    aliases: z.array(z.string()),
    summary: z.string(),
    mentionedInNotes: z.number().int(),
    relations: z.array(
      z.object({
        relation: z.string(),
        direction: z.enum(['out', 'in']),
        other: z.object({ id: z.string(), label: z.string() }),
        confidence: z.string(),
        status: z.string(),
      }),
    ),
  }),
  risk: 'read',
  execute(context, input) {
    const concept = findConcept(context, input.concept);
    const relations = context.services.relations
      .listFor(concept.id)
      .filter((relation) => relation.status !== 'rejected')
      .slice(0, 40)
      .map((relation) => {
        const out = relation.from.id === concept.id;
        return {
          relation: relation.relation,
          direction: out ? ('out' as const) : ('in' as const),
          other: out
            ? { id: relation.to.id, label: relation.to.label }
            : { id: relation.from.id, label: relation.from.label },
          confidence: relation.confidence,
          status: relation.status,
        };
      });
    return {
      output: {
        id: concept.id,
        name: concept.name,
        aliases: concept.aliases,
        summary: concept.summary,
        mentionedInNotes: concept.mentionCount,
        relations,
      },
    };
  },
  describe: (input, output) => `Looked up the concept “${output?.name ?? input.concept}”`,
});

export const searchGraph = defineTool({
  name: 'search_graph',
  category: 'concepts',
  description:
    'Explore the knowledge graph around a concept or note (by id or concept name): its neighbours up to two steps out, or the shortest path to another node when "to" is given.',
  input: z.object({
    node: z.string().trim().min(1).max(200),
    to: z.string().trim().min(1).max(200).optional(),
    depth: z.number().int().min(1).max(2).default(1),
    limit: z.number().int().min(1).max(60).default(30),
  }),
  output: z.object({
    found: z.boolean(),
    nodes: z.array(z.object({ id: z.string(), type: z.string(), label: z.string() })),
    edges: z.array(
      z.object({ from: z.string(), to: z.string(), relation: z.string(), confidence: z.string() }),
    ),
    truncated: z.boolean(),
  }),
  risk: 'read',
  execute(context, input) {
    const resolve = (reference: string) =>
      /^[a-z]+_[0-9A-Z]{26}$/u.test(reference) ? reference : findConcept(context, reference).id;
    const from = resolve(input.node);
    const payload = input.to
      ? context.services.graph.path(from, resolve(input.to), 'all')
      : context.services.graph.local(from, input.depth, GraphFilterSchema.parse({}));
    const nodes = payload.nodes.slice(0, input.limit);
    const keep = new Set(nodes.map((node) => node.id));
    const edges = payload.edges
      .filter((edge) => keep.has(edge.source) && keep.has(edge.target))
      .slice(0, input.limit * 2)
      .map((edge) => ({
        from: edge.source,
        to: edge.target,
        relation: edge.relation,
        confidence: edge.confidence,
      }));
    return {
      output: {
        found: 'found' in payload ? payload.found : nodes.length > 0,
        nodes: nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
        edges,
        truncated: payload.nodes.length > nodes.length,
      },
    };
  },
  describe: (input, output) =>
    output
      ? `Explored the graph from “${input.node}” (${count(output.nodes.length, 'node')})`
      : `Exploring the graph from “${input.node}”`,
});

export const createConcept = defineTool({
  name: 'create_concept',
  category: 'concepts',
  description:
    'Create a concept (an idea worth learning, such as “CAP theorem”). Names and aliases must be new. Undo deletes it if nothing has changed it.',
  input: z.object({
    name: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    summary: z.string().trim().max(2_000).default(''),
  }),
  output: z.object({ id: z.string(), name: z.string() }),
  risk: 'write',
  execute(context, input) {
    const concept = context.services.concepts.create(
      { name: input.name, aliases: input.aliases, summary: input.summary },
      'ai',
    );
    return {
      output: { id: concept.id, name: concept.name },
      undo: { conceptId: concept.id, updatedAt: concept.updatedAt } as Json,
    };
  },
  describe: (input, output) =>
    output ? `Created the concept “${output.name}”` : `Create the concept “${input.name}”`,
  canUndo(context, record) {
    const { conceptId, updatedAt } = record.undo as { conceptId: string; updatedAt: string };
    const current = context.services.concepts.list().find((concept) => concept.id === conceptId);
    if (!current) return 'The concept no longer exists.';
    return current.updatedAt === updatedAt ? null : 'The concept has been edited since.';
  },
  undo(context, record) {
    context.services.concepts.remove((record.undo as { conceptId: string }).conceptId);
  },
});

export const proposeRelations = defineTool({
  name: 'propose_relations',
  category: 'concepts',
  description:
    'Suggest relations between existing concepts (by id or name). They go to the Inbox for the student to accept; nothing enters the graph directly. Say how sure you are: EXTRACTED when a source states it, INFERRED (with a score 0.55–0.95) when you deduce it, AMBIGUOUS when unsure, and quote the evidence.',
  input: z.object({
    relations: z
      .array(
        z.object({
          from: z.string().trim().min(1).max(200),
          to: z.string().trim().min(1).max(200),
          relation: z.enum(EXTRACTED_RELATIONS),
          confidence: z
            .enum(
              CONFIDENCES.filter((value) => value !== 'USER') as [
                'EXTRACTED',
                'INFERRED',
                'AMBIGUOUS',
              ],
            )
            .default('INFERRED'),
          score: z.number().min(0.55).max(0.95).optional(),
          quote: z.string().trim().max(600).default(''),
        }),
      )
      .min(1)
      .max(50),
  }),
  output: z.object({ proposed: z.number().int(), proposalIds: z.array(z.string()) }),
  risk: 'write',
  items: (input) => input.relations.length,
  execute(context, input) {
    const ids: string[] = [];
    for (const item of input.relations) {
      let from = findConcept(context, item.from);
      let to = findConcept(context, item.to);
      if (from.id === to.id) throw new ValidationError('A relation needs two different concepts.');
      if (RELATIONS[item.relation].symmetric && to.id < from.id) [from, to] = [to, from];
      const row = context.services.proposals.propose({
        payload: {
          kind: 'relation',
          from: { conceptId: from.id, proposalId: null, name: from.name },
          to: { conceptId: to.id, proposalId: null, name: to.name },
          relation: item.relation,
          confidence: item.confidence,
          score: item.confidence === 'INFERRED' ? (item.score ?? 0.65) : null,
        },
        evidence: item.quote
          ? [{ quote: item.quote, title: 'The assistant', label: 'Suggested', locator: null }]
          : [],
        origin: {
          label: 'Relations suggested by the assistant',
          jobId: null,
          moduleId: null,
          lectureId: null,
          coveredIn: null,
        },
        dedupeKey: `relation:${from.id}:${item.relation}:${to.id}`,
      });
      if (row && !ids.includes(row.id)) ids.push(row.id);
    }
    return {
      output: { proposed: ids.length, proposalIds: ids },
      undo: { proposalIds: ids } as Json,
    };
  },
  describe: (_input, output) =>
    output
      ? `Suggested ${output.proposed} relation${output.proposed === 1 ? '' : 's'} (waiting in the Inbox)`
      : 'Suggesting relations',
  canUndo: (context, record) =>
    context.services.proposals.pendingAmong(
      (record.undo as { proposalIds: string[] }).proposalIds,
    ) > 0
      ? null
      : 'All of these suggestions have been decided already.',
  undo(context, record) {
    context.services.proposals.supersede((record.undo as { proposalIds: string[] }).proposalIds);
  },
});

export const mergeConcepts = defineTool({
  name: 'merge_concepts',
  category: 'concepts',
  description:
    'Merge a duplicate concept into the one to keep: cards, questions, relations and memberships move to it, and the duplicate’s name and aliases become aliases of it, so links keep working. Always needs the student’s approval.',
  input: z.object({ keep: ConceptId, merge: ConceptId }),
  output: z.object({
    keepId: z.string(),
    keptName: z.string(),
    mergedName: z.string(),
    aliases: z.array(z.string()),
  }),
  risk: 'destructive',
  execute(context, input) {
    const merged = context.services.concepts.list().find((concept) => concept.id === input.merge);
    const result = context.services.concepts.merge(input.keep, input.merge);
    context.services.mastery.invalidate();
    return {
      output: {
        keepId: input.keep,
        keptName: result.concept.name,
        mergedName: merged?.name ?? input.merge,
        aliases: result.concept.aliases,
      },
      undo: { snapshot: result.snapshot } as unknown as Json,
    };
  },
  describe: (_input, output) =>
    output ? `Merged “${output.mergedName}” into “${output.keptName}”` : 'Merging two concepts',
  ask(services, input) {
    const name = (id: string) =>
      services.concepts.list().find((concept) => concept.id === id)?.name ?? id;
    return `Merge the concept “${name(input.merge)}” into “${name(input.keep)}”`;
  },
  canUndo(context, record) {
    const { snapshot } = record.undo as unknown as { snapshot: MergeSnapshot };
    return context.services.concepts.list().some((concept) => concept.id === snapshot.keepId)
      ? null
      : 'The concept it was merged into no longer exists.';
  },
  undo(context, record) {
    context.services.concepts.unmerge(
      (record.undo as unknown as { snapshot: MergeSnapshot }).snapshot,
    );
    context.services.mastery.invalidate();
  },
});

export const conceptTools = [
  getConcept,
  searchGraph,
  createConcept,
  proposeRelations,
  mergeConcepts,
];
