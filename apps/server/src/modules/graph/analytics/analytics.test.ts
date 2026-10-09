import { UndirectedGraph } from 'graphology';
import { describe, expect, it } from 'vitest';
import { betweenness } from './centrality';
import { cohesion, communityHub, detectCommunities, stableIds } from './communities';
import { seededRandom } from './random';

type View = UndirectedGraph<object, { weight: number }>;

function view(edges: [string, string][], extra: string[] = []): View {
  const graph: View = new UndirectedGraph();
  for (const node of extra) graph.mergeNode(node);
  for (const [a, b] of edges) {
    graph.mergeNode(a);
    graph.mergeNode(b);
    graph.mergeEdge(a, b, { weight: 1 });
  }
  return graph;
}

/** Every pair of `nodes` joined. */
const clique = (nodes: string[]): [string, string][] =>
  nodes.flatMap((a, i) => nodes.slice(i + 1).map((b): [string, string] => [a, b]));

describe('betweenness', () => {
  it('matches Brandes on small graphs', () => {
    // a – b – c – d: b and c each lie on two of the three paths between other nodes.
    const path = betweenness(
      view([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
      ]),
    );
    expect(path.get('a')).toBe(0);
    expect(path.get('b')).toBeCloseTo(2 / 3);
    expect(path.get('c')).toBeCloseTo(2 / 3);
    // The centre of a star lies on every path between leaves.
    const star = betweenness(
      view([
        ['hub', 'x'],
        ['hub', 'y'],
        ['hub', 'z'],
      ]),
    );
    expect(star.get('hub')).toBeCloseTo(1);
    expect(star.get('x')).toBe(0);
  });

  it('samples large graphs, the same way every time', () => {
    const edges: [string, string][] = [];
    for (let i = 1; i < 1_500; i += 1)
      edges.push([
        `n${String(i).padStart(4, '0')}`,
        `n${String(Math.floor(i / 2)).padStart(4, '0')}`,
      ]);
    const graph = view(edges);
    const first = betweenness(graph);
    const second = betweenness(graph);
    expect([...first]).toEqual([...second]);
    // The root of the tree is near the top of the estimate.
    const ranked = [...first].sort((a, b) => b[1] - a[1]).map(([node]) => node);
    expect(ranked.slice(0, 5)).toContain('n0001');
  });
});

describe('communities', () => {
  const left = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const right = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const twoCliques = () => view([...clique(left), ...clique(right), ['a1', 'b1']], ['loner']);

  it('finds tightly knit groups and leaves unconnected nodes out', () => {
    const communities = detectCommunities(twoCliques());
    expect(communities).toEqual([left, right]);
    expect(detectCommunities(twoCliques())).toEqual(communities);
  });

  it('measures cohesion as edges present over edges possible', () => {
    const graph = twoCliques();
    expect(cohesion(graph, left)).toBe(1);
    expect(cohesion(graph, ['a1', 'b1', 'b2'])).toBeCloseTo(2 / 3);
    expect(cohesion(graph, ['loner'])).toBe(1);
  });

  it('splits a community that holds most of a large graph', () => {
    // Four loosely joined cliques of six: one oversized community would be split again.
    const groups = ['p', 'q', 'r', 's'].map((prefix) =>
      Array.from({ length: 6 }, (_, i) => `${prefix}${i}`),
    );
    const edges = groups.flatMap(clique);
    edges.push(['p0', 'q0'], ['q1', 'r0'], ['r1', 's0'], ['s1', 'p1']);
    const communities = detectCommunities(view(edges));
    expect(communities).toHaveLength(4);
    expect(Math.max(...communities.map((members) => members.length))).toBe(6);
  });

  it('keeps community ids stable between rebuilds', () => {
    const communities = [left, right];
    expect(stableIds(communities, new Map())).toEqual([0, 1]);
    // Before, the right-hand group was community 0 and a group that has since vanished was 1:
    // the right-hand group keeps 0, and the new one takes the smallest id no longer in use.
    const previous = new Map([...right.map((node): [string, number] => [node, 0]), ['gone', 1]]);
    expect(stableIds(communities, previous)).toEqual([1, 0]);
    // A group that mostly overlaps an old one inherits its id.
    expect(
      stableIds(
        [['a1', 'a2', 'x']],
        new Map([
          ['a1', 3],
          ['a2', 3],
        ]),
      ),
    ).toEqual([3]);
  });

  it('names a community after its best-connected concept', () => {
    const graph = view([
      ['note1', 'c1'],
      ['note1', 'c2'],
      ['note1', 'note2'],
      ['c1', 'c2'],
    ]);
    const describe = (node: string) => ({
      type: node.startsWith('c') ? 'concept' : 'note',
      label: node,
    });
    expect(communityHub(graph, ['note1', 'note2', 'c1', 'c2'], describe)).toBe('c1');
    expect(communityHub(graph, ['note1', 'note2'], describe)).toBe('note1');
  });
});

describe('seededRandom', () => {
  it('repeats for the same seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const values = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(values);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
