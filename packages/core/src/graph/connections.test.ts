import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../api/graph';
import { crossModuleConnections } from './connections';

const node = (
  id: string,
  modules: string[],
  degree = 1,
  type: GraphNode['type'] = 'concept',
): GraphNode => ({
  id,
  type,
  label: id,
  community: null,
  degree,
  modules,
  path: null,
});

const edge = (source: string, target: string, extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  relation: 'relates_to',
  kind: 'relation',
  confidence: 'USER',
  status: 'accepted',
  score: null,
  weight: 1,
  ...extra,
});

describe('connections across modules', () => {
  const nodes = [
    node('Consensus', ['CS301', 'CS402'], 5),
    node('Logging', ['CS301', 'CS402', 'CS500'], 2),
    node('Raft', ['CS301'], 3),
    node('Paxos', ['CS301']),
    node('Transactions', ['CS402'], 4),
    node('Caching', ['CS500']),
    node('Stray', []),
    node('A note', ['CS301'], 1, 'note'),
  ];

  it('lists concepts in more than one module, the widest first', () => {
    const { shared } = crossModuleConnections({ nodes, edges: [] });
    expect(shared.map((entry) => [entry.node.id, entry.modules])).toEqual([
      ['Logging', ['CS301', 'CS402', 'CS500']],
      ['Consensus', ['CS301', 'CS402']],
    ]);
  });

  it('keeps only relations between concepts whose modules do not overlap, strongest first', () => {
    const { links } = crossModuleConnections({
      nodes,
      edges: [
        edge('Raft', 'Paxos'),
        edge('Raft', 'Transactions', {
          confidence: 'INFERRED',
          score: 0.7,
          relation: 'prerequisite_for',
        }),
        edge('Paxos', 'Caching', { confidence: 'USER', relation: 'example_of' }),
        edge('Raft', 'Consensus'),
        edge('Raft', 'Stray'),
        edge('Raft', 'A note'),
        edge('Paxos', 'Transactions', { status: 'proposed' }),
        edge('Raft', 'Transactions', { id: 'link', kind: 'link' }),
      ],
    });
    expect(links.map((link) => link.why)).toEqual([
      'Paxos (CS301) is an example of Caching (CS500).',
      'Raft (CS301) is a prerequisite for Transactions (CS402).',
    ]);
    expect(links[0]?.sourceModules).toEqual(['CS301']);
  });

  it('is cut to the limit', () => {
    const many = Array.from({ length: 10 }, (_, index) => node(`C${index}`, ['A', 'B']));
    expect(crossModuleConnections({ nodes: many, edges: [] }, 3).shared).toHaveLength(3);
  });
});
