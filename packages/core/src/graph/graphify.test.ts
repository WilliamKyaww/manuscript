import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { GRAPHIFY_LIMITS, matchConcepts, nameWords, parseGraphify } from './graphify';

const graph = {
  directed: true,
  multigraph: false,
  nodes: [
    { id: 'raft_py', label: 'raft.py', file_type: 'code', source_file: 'src/raft.py' },
    {
      id: 'raft_node',
      label: 'RaftNode',
      file_type: 'code',
      source_file: 'src/raft.py',
      source_location: 'L12',
    },
    { id: 'elect', label: 'elect_leader()', file_type: 'code', source_file: 'src/raft.py' },
    {
      id: 'why',
      label: 'Randomised timeouts avoid split votes',
      file_type: 'rationale',
      rationale: 'Two candidates would otherwise tie.',
    },
    { id: 12, label: 'A numeric id', file_type: 'document' },
  ],
  links: [
    { source: 'raft_py', target: 'raft_node', relation: 'contains', confidence: 'EXTRACTED' },
    {
      source: 'raft_node',
      target: 'elect',
      relation: 'calls',
      confidence: 'inferred',
      confidence_score: 0.85,
      weight: 2,
    },
    { source: 'elect', target: 'why', relation: 'rationale_for' },
    { source: 'elect', target: 'nowhere', relation: 'calls' },
    { source: { id: 'raft_node' }, target: { id: 12 }, relation: 'cites', confidence: 'AMBIGUOUS' },
    'junk',
  ],
};

describe('reading a Graphify graph.json', () => {
  it('reads nodes and links, cleans what it keeps and drops edges to nowhere', () => {
    const parsed = parseGraphify(graph);
    expect(parsed.entities.map((entity) => entity.key)).toEqual([
      'raft_py',
      'raft_node',
      'elect',
      'why',
      '12',
    ]);
    expect(parsed.entities[1]).toEqual({
      key: 'raft_node',
      label: 'RaftNode',
      kind: 'code',
      file: 'src/raft.py',
      location: 'L12',
      rationale: null,
    });
    expect(parsed.entities[3]?.kind).toBe('rationale');
    expect(parsed.edges).toEqual([
      {
        source: 'raft_py',
        target: 'raft_node',
        relation: 'contains',
        confidence: 'EXTRACTED',
        score: null,
        weight: 1,
      },
      {
        source: 'raft_node',
        target: 'elect',
        relation: 'calls',
        confidence: 'INFERRED',
        score: 0.85,
        weight: 2,
      },
      {
        source: 'elect',
        target: 'why',
        relation: 'rationale_for',
        confidence: 'EXTRACTED',
        score: null,
        weight: 1,
      },
      {
        source: 'raft_node',
        target: '12',
        relation: 'cites',
        confidence: 'AMBIGUOUS',
        score: null,
        weight: 1,
      },
    ]);
    expect(parsed.droppedEdges).toBe(2);
  });

  it('also reads an "edges" list, and strips control characters and long labels', () => {
    const parsed = parseGraphify({
      nodes: [
        { id: 'a', label: `Bad\u0000 name${'x'.repeat(400)}` },
        { id: 'b', label: 'B' },
      ],
      edges: [{ source: 'a', target: 'b', relation: 'calls' }],
    });
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.entities[0]?.label).not.toContain('\u0000');
    expect(parsed.entities[0]?.label.length).toBe(GRAPHIFY_LIMITS.label);
  });

  it('refuses what is not a graph, or is too big to be a coursework repository', () => {
    for (const bad of [
      null,
      [],
      'text',
      {},
      { nodes: 'no' },
      { nodes: [] },
      { nodes: [{ id: '' }] },
    ])
      expect(() => parseGraphify(bad)).toThrow(ValidationError);
    const huge = {
      nodes: Array.from({ length: GRAPHIFY_LIMITS.nodes + 1 }, (_, i) => ({ id: i })),
    };
    expect(() => parseGraphify(huge)).toThrow(/at most 50000 can be imported/u);
  });
});

describe('which concepts a piece of code is about', () => {
  it('splits names into words', () => {
    expect(nameWords('RaftNode')).toEqual(['raft', 'node']);
    expect(nameWords('elect_leader()')).toEqual(['elect', 'leader']);
    expect(nameWords('HTTPServer')).toEqual(['http', 'server']);
    expect(nameWords('raft.py')).toEqual(['raft']);
    expect(nameWords('Two-phase commit')).toEqual(['two', 'phase', 'commit']);
  });

  const entities = [
    { key: 'a', label: 'Raft', kind: 'code' },
    { key: 'b', label: 'RaftNode', kind: 'code' },
    { key: 'c', label: 'leader_election()', kind: 'code' },
    { key: 'd', label: 'datastore', kind: 'code' },
    { key: 'e', label: 'Raft overview', kind: 'document' },
    { key: 'f', label: 'two_phase_commit', kind: 'code' },
  ];
  const concepts = [
    { id: 'raft', name: 'Raft', aliases: [] },
    { id: 'election', name: 'Leader election', aliases: [] },
    { id: 'data', name: 'Data', aliases: [] },
    { id: '2pc', name: 'Two-phase commit', aliases: ['2PC'] },
  ];

  it('proposes exact name matches strongly and contained names less so, for code only', () => {
    const matches = matchConcepts(entities, concepts);
    const byPair = new Map(matches.map((m) => [`${m.conceptId}:${m.entityKey}`, m]));
    expect(byPair.get('raft:a')?.score).toBe(0.9);
    expect(byPair.get('raft:b')?.score).toBe(0.6);
    expect(byPair.get('election:c')?.score).toBe(0.9);
    expect(byPair.get('2pc:f')?.score).toBe(0.9);
    expect(byPair.get('raft:b')?.reason).toBe('The name “RaftNode” contains “Raft”.');
    // A document is not code; "data" is too common a word to find inside other names.
    expect(byPair.has('raft:e')).toBe(false);
    expect(byPair.has('data:d')).toBe(false);
  });

  it('keeps only the best few per concept', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      key: `n${index}`,
      label: `Raft${'x'.repeat(index)}Thing`,
      kind: 'code',
    }));
    const many2 = many.map((entity, index) => ({ ...entity, label: `RaftHelper${index}` }));
    const matches = matchConcepts(many2, [{ id: 'raft', name: 'Raft', aliases: [] }]);
    expect(matches).toHaveLength(8);
  });
});
