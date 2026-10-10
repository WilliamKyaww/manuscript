import { isStructural, type KnowledgeGraph, semanticView } from '../assemble';
import { betweenness } from './centrality';
import { cohesion, communityHub, detectCommunities, stableIds } from './communities';
import { bridges, coreConcepts, isolatedConcepts, surprisingConnections } from './insights';

/**
 * Graph analytics (tasks 7.04–7.06, knowledge-system.md §7.2): communities, core concepts, bridges,
 * gaps and surprising connections, from which reports draw study prompts. Deterministic: the same
 * graph and the same previous communities always give the same result.
 */

export interface CommunityInfo {
  id: number;
  label: string;
  size: number;
  cohesion: number;
  hub: string;
  members: string[];
}

export interface Analysis {
  /** Each node's community (nodes in no community of two or more are absent). */
  communityOf: Map<string, number>;
  communities: CommunityInfo[];
  /** Distinct neighbours over knowledge edges; for modules, lectures and topics, over all edges. */
  degree: Map<string, number>;
  core: { node: string; degree: number }[];
  isolated: string[];
  bridges: { node: string; score: number; communities: number[]; own: number | null }[];
  surprising: { edge: string; score: number; reasons: string[] }[];
}

export function analyseGraph(
  graph: KnowledgeGraph,
  previousCommunities: ReadonlyMap<string, number>,
): Analysis {
  const view = semanticView(graph);
  const describe = (node: string) => ({
    type: graph.getNodeAttribute(node, 'type'),
    label: graph.getNodeAttribute(node, 'label'),
  });

  const groups = detectCommunities(view);
  const ids = stableIds(groups, previousCommunities);
  const communities = groups
    .map((members, index) => {
      const hub = communityHub(view, members, describe);
      return {
        id: ids[index] as number,
        label: describe(hub).label,
        size: members.length,
        cohesion: Math.round(cohesion(view, members) * 1000) / 1000,
        hub,
        members,
      };
    })
    .sort((a, b) => b.size - a.size || a.id - b.id);
  const communityOf = new Map<string, number>();
  for (const community of communities)
    for (const member of community.members) communityOf.set(member, community.id);

  const degree = new Map<string, number>();
  graph.forEachNode((node, attributes) => {
    degree.set(
      node,
      // Modules, lectures, topics and code are not in the semantic view: count what they touch.
      isStructural(attributes.type) || attributes.type === 'code'
        ? graph.neighbors(node).length
        : view.degree(node),
    );
  });

  const centrality = betweenness(view);
  const core = coreConcepts(graph, view);
  const isolated = isolatedConcepts(graph, view);
  const bridging = bridges(graph, view, centrality, communityOf);
  const labelOf = (id: number) =>
    communities.find((community) => community.id === id)?.label ?? `Cluster ${id}`;
  const surprising = surprisingConnections(graph, view, communityOf, labelOf);
  return { communityOf, communities, degree, core, isolated, bridges: bridging, surprising };
}
