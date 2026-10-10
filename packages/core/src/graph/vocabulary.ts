import { idKind } from '../ids';

/**
 * The knowledge graph's vocabulary (knowledge-system.md §7, data-model.md §5.5, ADR-0020): node
 * types, the small set of typed relations the user (and later the AI) can store, the relations
 * computed from files and course data, and the provenance labels every edge carries. The
 * confidence rubric follows Graphify's (Apache-2.0; see THIRD_PARTY_NOTICES.md), with `USER` added
 * for what the student asserted.
 */

export const NODE_TYPES = [
  'concept',
  'note',
  'source',
  'lecture',
  'module',
  'topic',
  'code',
] as const;
export type GraphNodeType = (typeof NODE_TYPES)[number];

const NODE_TYPE_OF_KIND: Partial<Record<string, GraphNodeType>> = {
  concept: 'concept',
  note: 'note',
  source: 'source',
  lecture: 'lecture',
  module: 'module',
  topic: 'topic',
  codeEntity: 'code',
};

/** The node type encoded in an id's prefix (`con_…` → concept), or `undefined`. */
export function nodeTypeOf(id: string): GraphNodeType | undefined {
  const kind = idKind(id);
  return kind === undefined ? undefined : NODE_TYPE_OF_KIND[kind];
}

/** Nodes that organise the course rather than carry knowledge; analytics treat them as hubs. */
export const STRUCTURAL_NODE_TYPES: readonly GraphNodeType[] = ['module', 'lecture', 'topic'];

export const CONFIDENCES = ['USER', 'EXTRACTED', 'INFERRED', 'AMBIGUOUS'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** How an edge is drawn: what the student or a file says is solid; reasoning is dashed; doubt is dotted. */
export function edgeStyleOf(confidence: Confidence): 'solid' | 'dashed' | 'dotted' {
  if (confidence === 'INFERRED') return 'dashed';
  if (confidence === 'AMBIGUOUS') return 'dotted';
  return 'solid';
}

export const RELATION_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

interface RelationDefinition {
  /** Symmetric relations read the same both ways and are stored once. */
  readonly symmetric: boolean;
  readonly from: readonly GraphNodeType[];
  readonly to: readonly GraphNodeType[];
  /** How the relation reads from its start, and from its end ("Paxos — is part of → Consensus"). */
  readonly label: string;
  readonly inverseLabel: string;
}

/** Relations that can be stored. Extended only with evidence of need (data-model.md §5.5). */
export const RELATIONS = {
  relates_to: {
    symmetric: true,
    from: ['concept'],
    to: ['concept'],
    label: 'relates to',
    inverseLabel: 'relates to',
  },
  prerequisite_for: {
    symmetric: false,
    from: ['concept'],
    to: ['concept'],
    label: 'is a prerequisite for',
    inverseLabel: 'depends on',
  },
  part_of: {
    symmetric: false,
    from: ['concept'],
    to: ['concept'],
    label: 'is part of',
    inverseLabel: 'has part',
  },
  example_of: {
    symmetric: false,
    from: ['concept'],
    to: ['concept'],
    label: 'is an example of',
    inverseLabel: 'has example',
  },
  contrasts_with: {
    symmetric: true,
    from: ['concept'],
    to: ['concept'],
    label: 'contrasts with',
    inverseLabel: 'contrasts with',
  },
  covered_in: {
    symmetric: false,
    from: ['concept'],
    to: ['lecture', 'source', 'note'],
    label: 'is covered in',
    inverseLabel: 'covers',
  },
  derived_from: {
    symmetric: false,
    from: ['note'],
    to: ['source'],
    label: 'is derived from',
    inverseLabel: 'is the origin of',
  },
} as const satisfies Record<string, RelationDefinition>;

export type StoredRelation = keyof typeof RELATIONS;
export const STORED_RELATIONS = Object.keys(RELATIONS) as StoredRelation[];

/** Relations between two concepts, offered when editing a concept's connections. */
export const CONCEPT_RELATIONS = STORED_RELATIONS.filter(
  (relation) =>
    (RELATIONS[relation].from as readonly string[]).includes('concept') &&
    (RELATIONS[relation].to as readonly string[]).includes('concept'),
);

/**
 * Relations computed from files and course data, never stored: wikilinks between notes (and to
 * sources), notes mentioning concepts, and membership in the course structure (`part_of`); and, for
 * an imported code graph, where a concept is implemented and which code uses which.
 */
export const COMPUTED_RELATIONS = ['links_to', 'mentioned_in', 'implemented_in', 'uses'] as const;
export const EDGE_RELATIONS = [...STORED_RELATIONS, ...COMPUTED_RELATIONS] as const;
export type EdgeRelation = StoredRelation | (typeof COMPUTED_RELATIONS)[number];

export const EDGE_RELATION_LABELS: Record<EdgeRelation, { label: string; inverseLabel: string }> = {
  ...RELATIONS,
  links_to: { label: 'links to', inverseLabel: 'is linked from' },
  mentioned_in: { label: 'is mentioned in', inverseLabel: 'mentions' },
  implemented_in: { label: 'is implemented in', inverseLabel: 'implements' },
  uses: { label: 'uses', inverseLabel: 'is used by' },
};

/**
 * Where an edge comes from: a stored `relation`, a `link` written in a note (or a concept's backing
 * note), or the course `structure`. Structure edges are left out of "semantic" degree.
 */
export const EDGE_KINDS = ['relation', 'link', 'structure'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Why a relation between these two node types is not allowed, or `null` when it is. */
export function relationProblem(
  relation: StoredRelation,
  from: GraphNodeType,
  to: GraphNodeType,
): string | null {
  const definition: RelationDefinition = RELATIONS[relation];
  if (!definition.from.includes(from) || !definition.to.includes(to)) {
    return `“${relation}” connects ${definition.from.join(' or ')} to ${definition.to.join(' or ')}, not ${from} to ${to}.`;
  }
  return null;
}
