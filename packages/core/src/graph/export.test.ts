import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../api/graph';
import { toGraphMl, toNodeLinkJson } from './export';

const node = (id: string, label: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type: 'concept',
  label,
  community: 0,
  degree: 1,
  modules: ['CS301'],
  path: null,
  ...extra,
});
const edge: GraphEdge = {
  id: 'rel_1',
  source: 'a',
  target: 'b',
  relation: 'prerequisite_for',
  kind: 'relation',
  confidence: 'USER',
  status: 'accepted',
  score: null,
  weight: 1,
  relationId: null,
};

describe('graph export', () => {
  const graph = {
    nodes: [node('a', 'Paxos & "Raft" <1>'), node('b', 'Log', { community: null })],
    edges: [edge],
  };

  it('writes node-link JSON that other tools can read', () => {
    const parsed = JSON.parse(toNodeLinkJson(graph, { exportedAt: 'now' }));
    expect(parsed).toMatchObject({
      directed: true,
      multigraph: true,
      graph: { exportedAt: 'now' },
    });
    expect(parsed.nodes[0]).toMatchObject({
      id: 'a',
      label: 'Paxos & "Raft" <1>',
      type: 'concept',
    });
    expect(parsed.links).toEqual([
      expect.objectContaining({
        source: 'a',
        target: 'b',
        relation: 'prerequisite_for',
        confidence: 'USER',
      }),
    ]);
  });

  it('writes well-formed GraphML with names escaped', () => {
    const xml = toGraphMl(graph);
    expect(xml).toContain('<node id="a">');
    expect(xml).toContain('<data key="label">Paxos &amp; &quot;Raft&quot; &lt;1&gt;</data>');
    expect(xml).toContain('<edge id="rel_1" source="a" target="b">');
    // A node with no community leaves the attribute out rather than writing "null".
    expect(xml).not.toContain('>null<');
    expect(xml.match(/<node /gu)).toHaveLength(2);
    expect(toGraphMl(graph)).toBe(xml);
  });
});
