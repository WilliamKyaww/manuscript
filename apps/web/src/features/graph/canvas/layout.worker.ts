import { UndirectedGraph } from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';

/**
 * ForceAtlas2 off the main thread (knowledge-system.md §7.3). Positions are posted after every
 * batch of iterations so the graph can settle visibly, and once more at the end.
 */

export interface LayoutRequest {
  nodes: { id: string; x: number; y: number }[];
  edges: [string, string, number][];
  iterations: number;
}

export interface LayoutProgress {
  /** x, y for each node of the request, in order. */
  positions: Float32Array;
  done: boolean;
}

const BATCH = 15;

/** The worker's global scope (the web app's types describe a window, not a worker). */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage(message: LayoutProgress, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const { nodes, edges, iterations } = event.data;
  const graph = new UndirectedGraph<{ x: number; y: number }, { weight: number }>();
  for (const node of nodes) graph.addNode(node.id, { x: node.x, y: node.y });
  for (const [source, target, weight] of edges) {
    if (source === target || !graph.hasNode(source) || !graph.hasNode(target)) continue;
    if (graph.hasEdge(source, target))
      graph.updateEdgeAttribute(source, target, 'weight', (value = 0) => value + weight);
    else graph.addEdge(source, target, { weight });
  }
  const settings = {
    ...forceAtlas2.inferSettings(graph),
    barnesHutOptimize: graph.order > 500,
    gravity: 1,
  };
  for (let done = 0; done < iterations; done += BATCH) {
    const batch = Math.min(BATCH, iterations - done);
    forceAtlas2.assign(graph, { iterations: batch, settings, getEdgeWeight: 'weight' });
    const positions = new Float32Array(nodes.length * 2);
    nodes.forEach((node, index) => {
      positions[index * 2] = graph.getNodeAttribute(node.id, 'x');
      positions[index * 2 + 1] = graph.getNodeAttribute(node.id, 'y');
    });
    const message: LayoutProgress = { positions, done: done + batch >= iterations };
    scope.postMessage(message, [positions.buffer]);
  }
};
