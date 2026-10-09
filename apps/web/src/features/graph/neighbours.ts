import type { GraphEdge, GraphNode, GraphPayload } from '@skb/core';
import { relationPhrase } from './nodes';

export interface Neighbour {
  node: GraphNode;
  phrase: string;
  edge: GraphEdge;
}

/**
 * A node's neighbours in a payload, grouped by how they relate to it ("is a prerequisite for",
 * "is mentioned in"…), groups and members in alphabetical order.
 */
export function neighboursOf(nodeId: string, payload: GraphPayload): Map<string, Neighbour[]> {
  const nodes = new Map(payload.nodes.map((candidate) => [candidate.id, candidate]));
  const groups = new Map<string, Neighbour[]>();
  for (const edge of payload.edges) {
    const forwards = edge.source === nodeId;
    if (!forwards && edge.target !== nodeId) continue;
    const other = nodes.get(forwards ? edge.target : edge.source);
    if (!other) continue;
    const phrase = relationPhrase(edge.relation, forwards);
    groups.set(phrase, [...(groups.get(phrase) ?? []), { node: other, phrase, edge }]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.node.label.localeCompare(b.node.label));
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
}
