import { z } from 'zod';
import {
  CONFIDENCES,
  EDGE_KINDS,
  EDGE_RELATIONS,
  type GraphNodeType,
  NODE_TYPES,
  nodeTypeOf,
  RELATION_STATUSES,
  STORED_RELATIONS,
} from '../graph/vocabulary';
import { idSchema } from '../ids';
import { LocatorSchema } from '../sources/types';
import { defineEndpoint } from './contract';

/**
 * The knowledge graph (knowledge-system.md §7): stored relations, the assembled graph with
 * server-side filters, a node's neighbourhood, paths, and the analytics report with study prompts.
 */

export const RelationIdSchema = idSchema('relation');
export const NodeTypeSchema = z.enum(NODE_TYPES);
export const ConfidenceSchema = z.enum(CONFIDENCES);
export const RelationStatusSchema = z.enum(RELATION_STATUSES);
export const StoredRelationSchema = z.enum(STORED_RELATIONS);
export const EdgeRelationSchema = z.enum(EDGE_RELATIONS);
export const EdgeKindSchema = z.enum(EDGE_KINDS);

/** Any id that can be a node: a concept, note, source, lecture, module or topic id. */
export const NodeIdSchema = z
  .string()
  .refine((value) => nodeTypeOf(value) !== undefined, 'Expected the id of a graph node.');

export const NodeRefSchema = z.object({
  type: NodeTypeSchema,
  id: z.string(),
  label: z.string(),
});
export type NodeRef = z.infer<typeof NodeRefSchema>;

/** A quote and where it came from, so a relation can be checked against its evidence. */
export const EvidenceSchema = z.object({
  quote: z.string().trim().max(1_000).optional(),
  locator: LocatorSchema.optional(),
});

export const RelationSchema = z.object({
  id: RelationIdSchema,
  from: NodeRefSchema,
  to: NodeRefSchema,
  relation: StoredRelationSchema,
  confidence: ConfidenceSchema,
  /** 0–1; for INFERRED relations the rubric is 0.55 (speculative) to 0.95 (near-certain). */
  score: z.number().min(0).max(1).nullable(),
  status: RelationStatusSchema,
  evidence: z.array(EvidenceSchema),
  createdBy: z.enum(['user', 'ai']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Relation = z.infer<typeof RelationSchema>;

export const RelationInputSchema = z.object({
  from: NodeIdSchema,
  to: NodeIdSchema,
  relation: StoredRelationSchema,
  /** Defaults to USER and accepted: what the student states. */
  confidence: ConfidenceSchema.optional(),
  score: z.number().min(0).max(1).nullish(),
  status: RelationStatusSchema.optional(),
  evidence: z.array(EvidenceSchema).max(10).optional(),
});
export type RelationInput = z.input<typeof RelationInputSchema>;

export const RelationUpdateSchema = z.object({
  relation: StoredRelationSchema.optional(),
  confidence: ConfidenceSchema.optional(),
  score: z.number().min(0).max(1).nullish(),
  status: RelationStatusSchema.optional(),
  evidence: z.array(EvidenceSchema).max(10).optional(),
});

// --- The assembled graph ----------------------------------------------------------------------

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  label: z.string(),
  /** Community in the whole graph (stable across rebuilds), or null for structural nodes. */
  community: z.number().int().nullable(),
  /** Edges that are not course structure, in the whole graph. */
  degree: z.number().int().nonnegative(),
  /** Module codes the node belongs to. */
  modules: z.array(z.string()),
  /** Vault path, for notes and sources. */
  path: z.string().nullable(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  relation: EdgeRelationSchema,
  kind: EdgeKindSchema,
  confidence: ConfidenceSchema,
  status: RelationStatusSchema,
  score: z.number().nullable(),
  /** How many links the edge stands for (a note linking twice to another counts 2). */
  weight: z.number().positive(),
  /** The stored relation behind the edge, if any. */
  relationId: RelationIdSchema.nullable(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const CommunitySchema = z.object({
  id: z.number().int().nonnegative(),
  /** Named after its best-connected member. */
  label: z.string(),
  size: z.number().int().positive(),
  /** Edges inside the community over the most it could have (0–1). */
  cohesion: z.number(),
});
export type Community = z.infer<typeof CommunitySchema>;

export const GraphPayloadSchema = z.object({
  /** Changes whenever anything the graph is built from changes. */
  version: z.number().int(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  /** Communities of the returned nodes, largest first. */
  communities: z.array(CommunitySchema),
  /** Nodes that matched the filters before the size limit. */
  matched: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type GraphPayload = z.infer<typeof GraphPayloadSchema>;

/** One value or several (`?types=concept&types=note`). */
function listOf<T extends z.ZodType>(item: T) {
  return z
    .union([item, z.array(item).max(50)])
    .transform((value) => (Array.isArray(value) ? value : [value]) as z.output<T>[])
    .optional();
}

export const GraphFilterSchema = z.object({
  /** Node types to include (default: everything but topics). */
  types: listOf(NodeTypeSchema),
  /** Only nodes belonging to these modules (by id). */
  modules: listOf(idSchema('module')),
  relations: listOf(EdgeRelationSchema),
  confidence: listOf(ConfidenceSchema),
  /** Stored relations with these statuses (default: accepted). Rejected ones are never drawn. */
  status: listOf(z.enum(['accepted', 'proposed'])),
  /** Also include notes and sources without any edge (default: no; concepts always show). */
  isolated: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(20_000).default(5_000),
});
export type GraphFilter = z.output<typeof GraphFilterSchema>;
export type GraphFilterInput = z.input<typeof GraphFilterSchema>;

// --- Analytics ----------------------------------------------------------------------------------

export const PromptActionSchema = z.object({
  label: z.string(),
  node: NodeRefSchema,
  /** Where the action leads: the node's own page, its place in the graph, or its relations. */
  view: z.enum(['page', 'graph', 'relations']),
});

export const StudyPromptSchema = z.object({
  /** Stable for the same finding, so dismissals and lists do not churn. */
  id: z.string(),
  kind: z.enum(['gap', 'bridge', 'verify', 'surprising', 'cohesion']),
  title: z.string(),
  detail: z.string(),
  actions: z.array(PromptActionSchema).min(1),
});
export type StudyPrompt = z.infer<typeof StudyPromptSchema>;

export const SurprisingConnectionSchema = z.object({
  edge: GraphEdgeSchema,
  source: NodeRefSchema,
  target: NodeRefSchema,
  score: z.number(),
  reasons: z.array(z.string()),
});

export const GraphReportSchema = z.object({
  version: z.number().int(),
  coreConcepts: z.array(z.object({ node: NodeRefSchema, degree: z.number().int() })),
  communities: z.array(CommunitySchema.extend({ hub: NodeRefSchema })),
  bridges: z.array(
    z.object({
      node: NodeRefSchema,
      score: z.number(),
      communities: z.array(z.number().int()),
    }),
  ),
  isolated: z.array(NodeRefSchema),
  surprising: z.array(SurprisingConnectionSchema),
  prompts: z.array(StudyPromptSchema),
});
export type GraphReport = z.infer<typeof GraphReportSchema>;

export const GraphPathSchema = z.object({
  found: z.boolean(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

// --- Endpoints ----------------------------------------------------------------------------------

const RelationParams = z.object({ id: RelationIdSchema });

export const listRelationsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/relations',
  query: z.object({
    /** Relations starting or ending at this node. */
    node: NodeIdSchema,
    status: listOf(RelationStatusSchema),
  }),
  response: z.object({ relations: z.array(RelationSchema) }),
});
export const createRelationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/relations',
  status: 201,
  body: RelationInputSchema,
  response: RelationSchema,
});
export const updateRelationEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/relations/:id',
  params: RelationParams,
  body: RelationUpdateSchema,
  response: RelationSchema,
});
export const deleteRelationEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/relations/:id',
  params: RelationParams,
  response: z.object({ ok: z.literal(true) }),
});

export const graphEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/graph',
  query: GraphFilterSchema,
  response: GraphPayloadSchema,
});
export const localGraphEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/graph/local',
  query: GraphFilterSchema.extend({
    node: NodeIdSchema,
    depth: z.coerce.number().int().min(1).max(2).default(1),
  }),
  response: GraphPayloadSchema,
});
export const graphPathEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/graph/path',
  query: z.object({
    from: NodeIdSchema,
    to: NodeIdSchema,
    /** `semantic` (default) never passes through a module, lecture or topic. */
    via: z.enum(['semantic', 'all']).default('semantic'),
  }),
  response: GraphPathSchema,
});
export const graphReportEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/graph/report',
  query: z.object({ module: idSchema('module').optional() }),
  response: GraphReportSchema,
});

/** A node's type, for ids already validated as node ids. */
export function nodeType(id: string): GraphNodeType {
  const type = nodeTypeOf(id);
  if (!type) throw new Error(`Not a graph node id: ${id}`);
  return type;
}
