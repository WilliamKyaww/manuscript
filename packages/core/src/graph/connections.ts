import type { GraphEdge, GraphNode } from '../api/graph';
import type { Confidence } from './vocabulary';

/**
 * Connections across modules (task 15.05): the concepts a student meets in more than one module, and
 * the stated relations between concepts that belong to different modules — where what is learnt in
 * one course turns out to matter in another. Pure, over the graph the server already builds.
 */

export interface SharedConcept {
  node: GraphNode;
  /** Module codes it belongs to. */
  modules: string[];
}

export interface CrossModuleLink {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
  sourceModules: string[];
  targetModules: string[];
  /** In a sentence: what the connection is. */
  why: string;
}

export interface CrossModuleConnections {
  shared: SharedConcept[];
  links: CrossModuleLink[];
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  USER: 3,
  EXTRACTED: 2,
  INFERRED: 1,
  AMBIGUOUS: 0,
};

const RELATION_VERBS: Record<string, string> = {
  prerequisite_for: 'is a prerequisite for',
  part_of: 'is part of',
  example_of: 'is an example of',
  contrasts_with: 'contrasts with',
  relates_to: 'relates to',
  covered_in: 'is covered in',
  derived_from: 'is derived from',
};

const joined = (codes: readonly string[]) => codes.join(', ');

export function crossModuleConnections(
  graph: { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] },
  limit = 50,
): CrossModuleConnections {
  const concepts = new Map(
    graph.nodes.filter((node) => node.type === 'concept').map((node) => [node.id, node]),
  );

  const shared = [...concepts.values()]
    .filter((node) => node.modules.length >= 2)
    .map((node) => ({ node, modules: [...node.modules].sort() }))
    .sort(
      (a, b) =>
        b.modules.length - a.modules.length ||
        b.node.degree - a.node.degree ||
        a.node.label.localeCompare(b.node.label),
    )
    .slice(0, limit);

  const links = graph.edges
    .filter((edge) => edge.kind === 'relation' && edge.status === 'accepted')
    .flatMap((edge) => {
      const source = concepts.get(edge.source);
      const target = concepts.get(edge.target);
      if (!source || !target) return [];
      // Both must belong to some module, and the two sets must not share one.
      if (source.modules.length === 0 || target.modules.length === 0) return [];
      if (source.modules.some((code) => target.modules.includes(code))) return [];
      const verb = RELATION_VERBS[edge.relation] ?? edge.relation.replaceAll('_', ' ');
      return [
        {
          edge,
          source,
          target,
          sourceModules: [...source.modules].sort(),
          targetModules: [...target.modules].sort(),
          why: `${source.label} (${joined(source.modules)}) ${verb} ${target.label} (${joined(target.modules)}).`,
        },
      ];
    })
    .sort(
      (a, b) =>
        CONFIDENCE_RANK[b.edge.confidence] - CONFIDENCE_RANK[a.edge.confidence] ||
        (b.edge.score ?? 0) - (a.edge.score ?? 0) ||
        a.why.localeCompare(b.why),
    )
    .slice(0, limit);

  return { shared, links };
}
