/**
 * A Graphify `graph.json` for a small coursework repository, built in code (like the source fixtures)
 * so that every test says exactly what the repository contains. The shape is Graphify's published
 * node-link output (docs/research/graphify.md §3): `nodes` with `file_type`, `source_file` and
 * `source_location`, and `links` with `relation`, `confidence` and `confidence_score`.
 */

export interface GraphifyFixture {
  directed: boolean;
  multigraph: boolean;
  nodes: Record<string, unknown>[];
  links: Record<string, unknown>[];
}

export function raftRepository(): GraphifyFixture {
  return {
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
      {
        id: 'raft_node_elect',
        label: '.elect_leader()',
        file_type: 'code',
        source_file: 'src/raft.py',
        source_location: 'L48',
      },
      {
        id: 'append_entries',
        label: 'append_entries()',
        file_type: 'code',
        source_file: 'src/log.py',
        source_location: 'L7',
      },
      { id: 'util_py', label: 'util.py', file_type: 'code', source_file: 'src/util.py' },
      {
        id: 'why_timeouts',
        label: 'Randomised timeouts avoid split votes',
        file_type: 'rationale',
        source_file: 'src/raft.py',
        rationale: 'Two candidates starting together would tie.',
      },
      { id: 'readme', label: 'README', file_type: 'document', source_file: 'README.md' },
    ],
    links: [
      { source: 'raft_py', target: 'raft_node', relation: 'contains', confidence: 'EXTRACTED' },
      {
        source: 'raft_node',
        target: 'raft_node_elect',
        relation: 'contains',
        confidence: 'EXTRACTED',
      },
      {
        source: 'raft_node_elect',
        target: 'append_entries',
        relation: 'calls',
        confidence: 'INFERRED',
        confidence_score: 0.85,
      },
      { source: 'raft_py', target: 'util_py', relation: 'imports', confidence: 'EXTRACTED' },
      { source: 'why_timeouts', target: 'raft_node_elect', relation: 'rationale_for' },
      { source: 'raft_node', target: 'ghost', relation: 'calls' },
    ],
  };
}

export const graphifyBytes = (graph: unknown) => new TextEncoder().encode(JSON.stringify(graph));
