import {
  type GraphEdge,
  type GraphFilter,
  type GraphNode,
  type GraphNodeType,
  type GraphPayload,
  type GraphReport,
  NODE_TYPES,
  type NodeRef,
  NotFoundError,
} from '@skb/core';
import type { EventBus } from '../../shared/events';
import { type Analysis, analyseGraph } from './analytics/analyse';
import { compareIds } from './analytics/communities';
import { LIMITS } from './analytics/insights';
import { studyPrompts } from './analytics/prompts';
import { assembleGraph, type EdgeAttributes, type KnowledgeGraph } from './assemble';
import type { GraphRepository } from './graph-repository';
import { neighbourhood, shortestPath } from './traverse';

/**
 * The knowledge graph service (tasks 7.03–7.07). The whole graph and its analytics are built
 * lazily and cached until something they are made from changes: notes, sources, the course
 * structure, concepts or relations (a version counter bumped by server events). Requests then
 * filter the cached graph.
 */

export interface GraphDependencies {
  repo: GraphRepository;
  events: EventBus;
}

/** Topics and imported code are shown only when asked for: there are many of them. */
const DEFAULT_TYPES: GraphNodeType[] = NODE_TYPES.filter(
  (type) => type !== 'topic' && type !== 'code',
);
/** What a size-limited graph keeps first: the ideas and the course, then the best-linked rest. */
const KEEP_FIRST: Record<GraphNodeType, number> = {
  concept: 0,
  module: 1,
  lecture: 2,
  topic: 3,
  source: 4,
  note: 5,
  code: 6,
};

interface Built {
  version: number;
  graph: KnowledgeGraph;
  /** Fingerprint of everything the analytics depend on. */
  signature: string;
  analysis: Analysis;
}

const sameAssignment = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) =>
  a.size === b.size && [...a].every(([node, community]) => b.get(node) === community);

/**
 * A fingerprint (FNV-1a) of the nodes, their names and modules, and the edges. Saving a note
 * changes the version but usually not this, so the expensive analytics can be kept.
 */
export function graphSignature(graph: KnowledgeGraph): string {
  let hash = 0x811c9dc5;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f;
  };
  graph.forEachNode((node, attributes) => {
    mix(node);
    mix(attributes.label);
    mix(attributes.modules.join(','));
  });
  graph.forEachEdge((edge, attributes) => {
    mix(edge);
    mix(`${attributes.status}${attributes.confidence}${attributes.weight}`);
  });
  return `${graph.order}:${graph.size}:${hash >>> 0}`;
}

export function createGraphService(deps: GraphDependencies) {
  const { repo, events } = deps;
  let version = 1;
  let built: Built | null = null;

  const unsubscribe = events.subscribe((event) => {
    if (
      event.type === 'vault.changed' ||
      event.type === 'sources.changed' ||
      event.type === 'data.changed'
    )
      version += 1;
  });

  const current = (): Built => {
    if (built?.version === version) return built;
    const at = version;
    const graph = assembleGraph(repo.read());
    const signature = graphSignature(graph);
    if (built?.signature === signature) {
      built = { ...built, version: at, graph };
      return built;
    }
    const previous = repo.previousCommunities();
    const analysis = analyseGraph(graph, previous);
    if (!sameAssignment(previous, analysis.communityOf)) repo.saveCommunities(analysis.communityOf);
    built = { version: at, graph, signature, analysis };
    return built;
  };

  const ref = ({ graph }: Built, node: string): NodeRef => ({
    type: graph.getNodeAttribute(node, 'type'),
    id: node,
    label: graph.getNodeAttribute(node, 'label'),
  });

  const toNode = ({ graph, analysis }: Built, node: string): GraphNode => {
    const attributes = graph.getNodeAttributes(node);
    return {
      id: node,
      type: attributes.type,
      label: attributes.label,
      community: analysis.communityOf.get(node) ?? null,
      degree: analysis.degree.get(node) ?? 0,
      modules: attributes.modules,
      path: attributes.path,
    };
  };

  const toEdge = ({ graph }: Built, edge: string): GraphEdge => {
    const attributes = graph.getEdgeAttributes(edge);
    return {
      id: edge,
      source: graph.source(edge),
      target: graph.target(edge),
      relation: attributes.relation,
      kind: attributes.kind,
      confidence: attributes.confidence,
      status: attributes.status,
      score: attributes.score,
      weight: attributes.weight,
      relationId: attributes.relationId as GraphEdge['relationId'],
    };
  };

  const tests = (filter: GraphFilter, built: Built) => {
    const types = new Set(filter.types ?? DEFAULT_TYPES);
    const modules = filter.modules ? new Set<string>(filter.modules) : null;
    const relations = filter.relations ? new Set(filter.relations) : null;
    const confidences = filter.confidence ? new Set(filter.confidence) : null;
    const statuses = new Set<string>(filter.status ?? ['accepted']);
    return {
      node: (node: string) => {
        const attributes = built.graph.getNodeAttributes(node);
        return (
          types.has(attributes.type) &&
          (modules === null || attributes.moduleIds.some((id) => modules.has(id)))
        );
      },
      edge: (attributes: EdgeAttributes) =>
        statuses.has(attributes.status) &&
        (relations === null || relations.has(attributes.relation)) &&
        (confidences === null || confidences.has(attributes.confidence)),
    };
  };

  /** The payload for a set of candidate nodes: their edges, the size limit, their communities. */
  const payload = (
    built: Built,
    candidates: Iterable<string>,
    filter: GraphFilter,
    options: { keep?: string; dropIsolated: boolean },
  ): GraphPayload => {
    const { graph, analysis } = built;
    const test = tests(filter, built);
    const edgesAmong = (nodes: ReadonlySet<string>) => {
      const edges: string[] = [];
      for (const node of nodes)
        graph.forEachOutEdge(node, (edge, attributes, _source, target) => {
          if (nodes.has(target) && test.edge(attributes)) edges.push(edge);
        });
      return edges.sort(compareIds);
    };

    let nodes = new Set([...candidates].filter((node) => node === options.keep || test.node(node)));
    if (options.dropIsolated) {
      const linked = new Set<string>();
      for (const edge of edgesAmong(nodes)) {
        linked.add(graph.source(edge));
        linked.add(graph.target(edge));
      }
      nodes = new Set(
        [...nodes].filter((node) => {
          const type = graph.getNodeAttribute(node, 'type');
          return (type !== 'note' && type !== 'source' && type !== 'code') || linked.has(node);
        }),
      );
    }
    const matched = nodes.size;
    if (nodes.size > filter.limit) {
      const ranked = [...nodes].sort(
        (a, b) =>
          Number(b === options.keep) - Number(a === options.keep) ||
          KEEP_FIRST[graph.getNodeAttribute(a, 'type')] -
            KEEP_FIRST[graph.getNodeAttribute(b, 'type')] ||
          (analysis.degree.get(b) ?? 0) - (analysis.degree.get(a) ?? 0) ||
          compareIds(a, b),
      );
      nodes = new Set(ranked.slice(0, filter.limit));
    }
    const ordered = [...nodes].sort(compareIds);
    const present = new Set(ordered.map((node) => analysis.communityOf.get(node)));
    return {
      version: built.version,
      nodes: ordered.map((node) => toNode(built, node)),
      edges: edgesAmong(nodes).map((edge) => toEdge(built, edge)),
      communities: analysis.communities
        .filter((community) => present.has(community.id))
        .map(({ id, label, size, cohesion }) => ({ id, label, size, cohesion })),
      matched,
      truncated: matched > nodes.size,
    };
  };

  const requireNode = (built: Built, node: string) => {
    if (!built.graph.hasNode(node)) throw new NotFoundError('That item is not in the graph.');
  };

  return {
    /** The current version; it changes whenever the graph would. */
    version: () => version,

    graph(filter: GraphFilter): GraphPayload {
      const state = current();
      return payload(state, state.graph.nodes(), filter, { dropIsolated: !filter.isolated });
    },

    local(node: string, depth: number, filter: GraphFilter): GraphPayload {
      const state = current();
      requireNode(state, node);
      const test = tests(filter, state);
      const reached = neighbourhood(state.graph, node, depth, test.edge);
      return payload(state, reached, filter, { keep: node, dropIsolated: false });
    },

    path(from: string, to: string, via: 'semantic' | 'all') {
      const state = current();
      requireNode(state, from);
      requireNode(state, to);
      const found = shortestPath(
        state.graph,
        from,
        to,
        via,
        (attributes) => attributes.status === 'accepted',
      );
      return {
        found: found !== null,
        nodes: (found?.nodes ?? []).map((node) => toNode(state, node)),
        edges: (found?.edges ?? []).map((edge) => toEdge(state, edge)),
      };
    },

    /** Analytics and study prompts, for the whole graph or narrowed to one module. */
    report(moduleId?: string): GraphReport {
      const state = current();
      const { graph, analysis } = state;
      const inModule = (node: string) =>
        moduleId === undefined || graph.getNodeAttribute(node, 'moduleIds').includes(moduleId);
      const communities = analysis.communities.filter((community) =>
        community.members.some(inModule),
      );
      const isolated = analysis.isolated.filter(inModule);
      const bridges = analysis.bridges.filter(({ node }) => inModule(node));
      const surprising = analysis.surprising.filter(
        ({ edge }) => inModule(graph.source(edge)) || inModule(graph.target(edge)),
      );
      return {
        version: state.version,
        coreConcepts: analysis.core
          .filter(({ node }) => inModule(node))
          .slice(0, LIMITS.core)
          .map(({ node, degree }) => ({ node: ref(state, node), degree })),
        communities: communities.map(({ id, label, size, cohesion, hub }) => ({
          id,
          label,
          size,
          cohesion,
          hub: ref(state, hub),
        })),
        bridges: bridges.slice(0, LIMITS.bridges).map(({ node, score, communities }) => ({
          node: ref(state, node),
          score,
          communities,
        })),
        isolated: isolated.slice(0, LIMITS.isolated).map((node) => ref(state, node)),
        surprising: surprising.slice(0, LIMITS.surprising).map(({ edge, score, reasons }) => ({
          edge: toEdge(state, edge),
          source: ref(state, graph.source(edge)),
          target: ref(state, graph.target(edge)),
          score,
          reasons,
        })),
        prompts: studyPrompts({
          graph,
          degree: (node) => analysis.degree.get(node) ?? 0,
          isolated,
          bridges,
          surprising,
          communities,
          include: moduleId === undefined ? undefined : inModule,
        }),
      };
    },

    close: () => unsubscribe(),
  };
}

export type GraphService = ReturnType<typeof createGraphService>;
