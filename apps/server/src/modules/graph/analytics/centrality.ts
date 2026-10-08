import type { UndirectedGraph } from 'graphology';
import { compareIds } from './communities';
import { seededRandom } from './random';

/** Above this many nodes betweenness is estimated from a sample of sources (as Graphify does). */
export const EXACT_BETWEENNESS_LIMIT = 1_000;
export const BETWEENNESS_SAMPLES = 200;

/**
 * Betweenness centrality (Brandes 2001) of an undirected, unweighted graph, normalised to 0–1: the
 * share of shortest paths between other nodes that pass through each node. Large graphs use
 * `samples` source nodes picked with a seeded random source, scaled up (Brandes and Pich 2007), so
 * the estimate is the same on every run.
 */
export function betweenness(
  view: UndirectedGraph,
  options: { samples?: number; seed?: number } = {},
): Map<string, number> {
  const nodes = view.nodes().sort(compareIds);
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node, i]));
  const adjacency = nodes.map((node) =>
    view
      .neighbors(node)
      .map((neighbour) => index.get(neighbour) as number)
      .sort((a, b) => a - b),
  );

  const sampled = n > EXACT_BETWEENNESS_LIMIT;
  const k = sampled ? Math.min(n, options.samples ?? BETWEENNESS_SAMPLES) : n;
  const sources = nodes.map((_, i) => i);
  if (sampled) {
    const random = seededRandom(options.seed ?? 42);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [sources[i], sources[j]] = [sources[j] as number, sources[i] as number];
    }
  }

  const centrality = new Float64Array(n);
  const sigma = new Float64Array(n);
  const distance = new Int32Array(n);
  const delta = new Float64Array(n);
  const order = new Int32Array(n);
  for (const source of sources.slice(0, k)) {
    sigma.fill(0);
    distance.fill(-1);
    delta.fill(0);
    sigma[source] = 1;
    distance[source] = 0;
    // Breadth-first search; `order` doubles as the queue and, read backwards, the stack.
    let head = 0;
    let tail = 0;
    order[tail++] = source;
    while (head < tail) {
      const v = order[head++] as number;
      for (const w of adjacency[v] as number[]) {
        if (distance[w] === -1) {
          distance[w] = (distance[v] as number) + 1;
          order[tail++] = w;
        }
        if (distance[w] === (distance[v] as number) + 1)
          sigma[w] = (sigma[w] as number) + (sigma[v] as number);
      }
    }
    // Dependencies, from the farthest nodes back; predecessors are the neighbours one step closer.
    for (let i = tail - 1; i > 0; i -= 1) {
      const w = order[i] as number;
      for (const v of adjacency[w] as number[]) {
        if (distance[v] === (distance[w] as number) - 1)
          delta[v] =
            (delta[v] as number) +
            ((sigma[v] as number) / (sigma[w] as number)) * (1 + (delta[w] as number));
      }
      centrality[w] = (centrality[w] as number) + (delta[w] as number);
    }
  }

  // Each pair is counted from both ends in an undirected graph, so the normaliser is (n−1)(n−2).
  const scale = n > 2 ? (1 / ((n - 1) * (n - 2))) * (n / k) : 0;
  return new Map(nodes.map((node, i) => [node, (centrality[i] as number) * scale]));
}
