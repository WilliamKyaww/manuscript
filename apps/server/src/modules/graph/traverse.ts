import { compareIds } from './analytics/communities';
import { type EdgeAttributes, isStructural, type KnowledgeGraph } from './assemble';

/** Walking the graph for local views and paths (task 7.07). Edges are followed both ways. */

type EdgeTest = (attributes: EdgeAttributes) => boolean;

/** Neighbours reached over allowed edges, in id order, each with the first such edge (by id). */
function steps(graph: KnowledgeGraph, node: string, allowed: EdgeTest) {
  const best = new Map<string, string>();
  graph.forEachEdge(node, (edge, attributes, source, target) => {
    if (!allowed(attributes)) return;
    const other = source === node ? target : source;
    const current = best.get(other);
    if (current === undefined || compareIds(edge, current) < 0) best.set(other, edge);
  });
  return [...best].sort(([a], [b]) => compareIds(a, b));
}

/**
 * Nodes within `depth` steps of `centre`. Beyond the first step the walk does not pass through
 * modules, lectures or topics (unless the centre is one): a concept's neighbourhood should not
 * become its whole module.
 */
export function neighbourhood(
  graph: KnowledgeGraph,
  centre: string,
  depth: number,
  allowed: EdgeTest,
): Set<string> {
  const reached = new Set([centre]);
  let frontier = [centre];
  for (let step = 1; step <= depth; step += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      if (node !== centre && isStructural(graph.getNodeAttribute(node, 'type'))) continue;
      for (const [neighbour] of steps(graph, node, allowed)) {
        if (reached.has(neighbour)) continue;
        reached.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return reached;
}

/**
 * A shortest path from `from` to `to` (breadth-first, neighbours in id order, so the same path every
 * time). `semantic` paths never pass through a module, lecture or topic, and use course structure
 * only to start or finish ("How does X relate to Y?" should not answer "both are in COC251").
 */
export function shortestPath(
  graph: KnowledgeGraph,
  from: string,
  to: string,
  via: 'semantic' | 'all',
  allowed: EdgeTest,
): { nodes: string[]; edges: string[] } | null {
  if (from === to) return { nodes: [from], edges: [] };
  const previous = new Map<string, { node: string; edge: string }>();
  const seen = new Set([from]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      const structural = isStructural(graph.getNodeAttribute(node, 'type'));
      if (via === 'semantic' && structural && node !== from) continue;
      for (const [neighbour, edge] of steps(graph, node, allowed)) {
        if (seen.has(neighbour)) continue;
        if (via === 'semantic') {
          const kind = graph.getEdgeAttribute(edge, 'kind');
          if (kind === 'structure' && node !== from && neighbour !== to) continue;
          if (isStructural(graph.getNodeAttribute(neighbour, 'type')) && neighbour !== to) continue;
        }
        seen.add(neighbour);
        previous.set(neighbour, { node, edge });
        if (neighbour === to) {
          const nodes = [to];
          const edges: string[] = [];
          let cursor = to;
          for (let link = previous.get(cursor); link; link = previous.get(cursor)) {
            edges.unshift(link.edge);
            nodes.unshift(link.node);
            cursor = link.node;
          }
          return { nodes, edges };
        }
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return null;
}
