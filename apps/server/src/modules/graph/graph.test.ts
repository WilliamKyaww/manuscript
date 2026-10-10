import { type GraphFilterInput, GraphFilterSchema, type Id } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../shared/events';
import { assembleGraph } from './assemble';
import type { GraphData, GraphRepository } from './graph-repository';
import type { RelationRow } from './relations-repository';
import { createGraphService, graphSignature } from './service';

/**
 * A small course: Distributed Systems (COC251) with a lecture, a topic, concepts, notes and slides;
 * Machine Learning (COC254) with its own; one note links both modules.
 */
const relation = (
  id: string,
  fromId: string,
  toId: string,
  rest: Partial<RelationRow> & Pick<RelationRow, 'relation'>,
): RelationRow => ({
  id,
  fromType: 'concept',
  fromId,
  toType: 'concept',
  toId,
  confidence: 'USER',
  score: null,
  status: 'accepted',
  evidenceJson: '[]',
  createdBy: 'user',
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  ...rest,
});

function course(): GraphData {
  return {
    modules: [
      { id: 'mod_ds', code: 'COC251', title: 'Distributed Systems' },
      { id: 'mod_ml', code: 'COC254', title: 'Machine Learning' },
    ],
    topics: [{ id: 'top_cons', moduleId: 'mod_ds', parentId: null, title: 'Consensus' }],
    lectures: [{ id: 'lec_l03', moduleId: 'mod_ds', key: 'L03', title: 'Consensus' }],
    concepts: [
      {
        id: 'con_backprop',
        name: 'Back-propagation',
        noteId: 'note_bp',
        moduleIds: ['mod_ml'],
        topicIds: [],
      },
      { id: 'con_cap', name: 'CAP theorem', noteId: null, moduleIds: ['mod_ds'], topicIds: [] },
      { id: 'con_lonely', name: 'Lonely idea', noteId: null, moduleIds: ['mod_ml'], topicIds: [] },
      {
        id: 'con_paxos',
        name: 'Paxos',
        noteId: null,
        moduleIds: ['mod_ds'],
        topicIds: ['top_cons'],
      },
      { id: 'con_raft', name: 'Raft', noteId: null, moduleIds: ['mod_ds'], topicIds: [] },
      {
        id: 'con_sgd',
        name: 'Gradient descent',
        noteId: null,
        moduleIds: ['mod_ml'],
        topicIds: [],
      },
    ],
    notes: [
      {
        id: 'note_bp',
        title: 'Back-propagation',
        path: 'ML/bp.md',
        moduleCode: 'COC254',
        lectureKey: null,
      },
      {
        id: 'note_bridge',
        title: 'Learning to agree',
        path: 'bridge.md',
        moduleCode: null,
        lectureKey: null,
      },
      {
        id: 'note_cons',
        title: 'Consensus notes',
        path: 'DS/cons.md',
        moduleCode: 'COC251',
        lectureKey: 'L03',
      },
      {
        id: 'note_ml',
        title: 'ML week 1',
        path: 'ML/week1.md',
        moduleCode: 'COC254',
        lectureKey: null,
      },
      {
        id: 'note_orphan',
        title: 'Shopping list',
        path: 'list.md',
        moduleCode: null,
        lectureKey: null,
      },
      {
        id: 'note_raft',
        title: 'Raft notes',
        path: 'DS/raft.md',
        moduleCode: 'coc251',
        lectureKey: 'COC251/L03',
      },
    ],
    links: [
      { fromNote: 'note_bridge', kind: 'concept', target: 'con_raft', count: 1 },
      { fromNote: 'note_bridge', kind: 'concept', target: 'con_sgd', count: 1 },
      { fromNote: 'note_cons', kind: 'attachment', target: 'Sources/COC251/slides.pdf', count: 1 },
      { fromNote: 'note_cons', kind: 'concept', target: 'con_paxos', count: 2 },
      { fromNote: 'note_cons', kind: 'concept', target: 'con_raft', count: 1 },
      { fromNote: 'note_cons', kind: 'note', target: 'note_raft', count: 1 },
      { fromNote: 'note_ml', kind: 'concept', target: 'con_sgd', count: 1 },
      { fromNote: 'note_ml', kind: 'note', target: 'note_bp', count: 1 },
      { fromNote: 'note_raft', kind: 'concept', target: 'con_raft', count: 1 },
    ],
    sources: [
      { id: 'src_ml', title: 'ML slides', path: 'Sources/COC254/ml.pdf', moduleCode: 'COC254' },
      {
        id: 'src_slides',
        title: 'Consensus slides',
        path: 'Sources/COC251/slides.pdf',
        moduleCode: 'COC251',
      },
    ],
    lectureSources: [{ lectureId: 'lec_l03', sourceId: 'src_slides' }],
    code: { entities: [], edges: [], links: [] },
    relations: [
      relation('rel_1', 'con_paxos', 'con_raft', { relation: 'prerequisite_for' }),
      relation('rel_2', 'con_cap', 'con_sgd', {
        relation: 'relates_to',
        confidence: 'INFERRED',
        score: 0.6,
        status: 'proposed',
        createdBy: 'ai',
      }),
      relation('rel_3', 'con_raft', 'con_ghost', { relation: 'contrasts_with' }),
      relation('rel_4', 'con_sgd', 'con_backprop', {
        relation: 'example_of',
        confidence: 'AMBIGUOUS',
      }),
    ],
  };
}

describe('graph assembly', () => {
  it('builds nodes and edges from the course, links and relations', () => {
    const graph = assembleGraph(course());
    expect(graph.order).toBe(18);
    const edges = new Set(graph.edges());
    // Course structure: concepts under their topic rather than also their module; notes under
    // the lecture their properties name; sources under their lecture, or else their module.
    for (const id of [
      'part_of:lec_l03:mod_ds',
      'part_of:top_cons:mod_ds',
      'part_of:con_paxos:top_cons',
      'part_of:con_raft:mod_ds',
      'part_of:note_cons:lec_l03',
      'part_of:note_raft:lec_l03',
      'part_of:note_ml:mod_ml',
      'part_of:src_slides:lec_l03',
      'part_of:src_ml:mod_ml',
      'mentioned_in:con_paxos:note_cons',
      'links_to:note_cons:note_raft',
      'links_to:note_cons:src_slides',
      'covered_in:con_backprop:note_bp',
      'rel_1',
    ])
      expect(edges, id).toContain(id);
    expect(edges).not.toContain('part_of:con_paxos:mod_ds');
    expect(edges).not.toContain('part_of:src_slides:mod_ds');
    expect(edges).not.toContain('rel_3'); // its other end does not exist
    expect(graph.getEdgeAttributes('mentioned_in:con_paxos:note_cons')).toMatchObject({
      kind: 'link',
      confidence: 'EXTRACTED',
      weight: 2,
    });
    expect(graph.getNodeAttributes('note_raft')).toMatchObject({
      modules: ['COC251'],
      moduleIds: ['mod_ds'],
    });
    expect(graph.getNodeAttribute('con_paxos', 'modules')).toEqual(['COC251']);
    expect(graph.getNodeAttribute('lec_l03', 'label')).toBe('L03 Consensus');
  });
});

function service(data = course()) {
  const events = createEventBus();
  let saved = new Map<string, number>();
  const calls = { reads: 0, saves: 0 };
  const repo = {
    read: () => {
      calls.reads += 1;
      return data;
    },
    previousCommunities: () => saved,
    saveCommunities: (assignment: ReadonlyMap<string, number>) => {
      calls.saves += 1;
      saved = new Map(assignment);
    },
  } as unknown as GraphRepository;
  const graph = createGraphService({ repo, events });
  const filter = (input: GraphFilterInput = {}) => GraphFilterSchema.parse(input);
  return { graph, events, calls, filter };
}

describe('graph service', () => {
  it('serves the graph from a cache that follows changes', () => {
    const { graph, events, calls, filter } = service();
    const first = graph.graph(filter());
    graph.graph(filter({ types: 'concept' }));
    graph.report();
    expect(calls).toEqual({ reads: 1, saves: 1 });
    events.publish({ type: 'data.changed', area: 'relations' });
    const second = graph.graph(filter());
    expect(second.version).toBeGreaterThan(first.version);
    // Same communities as before: nothing to save.
    expect(calls).toEqual({ reads: 2, saves: 1 });
    expect(second.nodes.map((node) => node.community)).toEqual(
      first.nodes.map((node) => node.community),
    );
  });

  it('keeps the analytics while only note text changes, and redoes them when names change', () => {
    const data = course();
    expect(graphSignature(assembleGraph(data))).toBe(graphSignature(assembleGraph(course())));
    const { graph, events, filter } = service(data);
    const before = graph.report();
    events.publish({ type: 'vault.changed', notes: [], structure: false });
    expect(graph.report()).toEqual({ ...before, version: before.version + 1 });

    const raft = data.concepts.find((concept) => concept.id === 'con_raft');
    if (raft) raft.name = 'Raft algorithm';
    events.publish({ type: 'data.changed', area: 'concepts' });
    expect(graphSignature(assembleGraph(data))).not.toBe(graphSignature(assembleGraph(course())));
    expect(graph.report().coreConcepts[0]?.node.label).toBe('Raft algorithm');
    expect(graph.graph(filter()).nodes.find((node) => node.id === 'con_raft')?.label).toBe(
      'Raft algorithm',
    );
  });

  it('keeps concepts and the course first when the graph is cut to size', () => {
    const { graph, filter } = service();
    const limited = graph.graph(filter({ limit: 6 }));
    expect(limited.nodes.map((node) => node.type).sort()).toEqual([
      'concept',
      'concept',
      'concept',
      'concept',
      'concept',
      'concept',
    ]);
  });

  it('filters by type, module, status and confidence, and leaves unlinked notes out', () => {
    const { graph, filter } = service();
    const all = graph.graph(filter());
    const ids = all.nodes.map((node) => node.id);
    expect(ids).not.toContain('note_orphan');
    expect(ids).not.toContain('top_cons'); // topics only on request
    expect(ids).toContain('con_lonely'); // concepts always show, linked or not
    expect(all.edges.map((edge) => edge.id)).not.toContain('rel_2'); // proposed
    expect(graph.graph(filter({ isolated: 'true' })).nodes.map((node) => node.id)).toContain(
      'note_orphan',
    );

    const withProposed = graph.graph(filter({ status: ['accepted', 'proposed'] }));
    expect(withProposed.edges.find((edge) => edge.id === 'rel_2')).toMatchObject({
      confidence: 'INFERRED',
      status: 'proposed',
      relationId: 'rel_2',
    });
    expect(graph.graph(filter({ confidence: 'AMBIGUOUS' })).edges.map((edge) => edge.id)).toEqual([
      'rel_4',
    ]);
    // The fixture's readable ids would not pass the id check, so this filter is built directly.
    const ml = graph.graph({ ...filter(), modules: ['mod_ml' as Id<'module'>] });
    expect(ml.nodes.every((node) => node.modules.includes('COC254'))).toBe(true);
    expect(ml.nodes.map((node) => node.id)).toContain('con_sgd');

    const limited = graph.graph(filter({ limit: 3 }));
    expect(limited).toMatchObject({ truncated: true, matched: all.nodes.length });
    expect(limited.nodes).toHaveLength(3);
  });

  it('shows a neighbourhood without spreading through the module', () => {
    const { graph, filter } = service();
    const one = graph.local('con_raft', 1, filter()).nodes.map((node) => node.id);
    expect(one).toEqual(
      expect.arrayContaining([
        'con_raft',
        'con_paxos',
        'note_cons',
        'note_raft',
        'note_bridge',
        'mod_ds',
      ]),
    );
    const two = graph.local('con_raft', 2, filter()).nodes.map((node) => node.id);
    expect(two).toContain('con_sgd'); // through the note that links both
    expect(two).not.toContain('con_cap'); // only reachable through COC251 itself
    expect(() => graph.local('con_missing', 1, filter())).toThrow('not in the graph');
  });

  it('finds paths that do not go through the course structure', () => {
    const { graph } = service();
    const path = graph.path('con_paxos', 'con_sgd', 'semantic');
    expect(path.found).toBe(true);
    expect(path.nodes.map((node) => node.id)).toEqual([
      'con_paxos',
      'con_raft',
      'note_bridge',
      'con_sgd',
    ]);
    expect(path.edges.map((edge) => edge.relation)).toEqual([
      'prerequisite_for',
      'mentioned_in',
      'mentioned_in',
    ]);
    expect(graph.path('con_cap', 'con_lonely', 'semantic').found).toBe(false);
    expect(graph.path('con_cap', 'con_raft', 'all').found).toBe(true); // both in COC251
  });

  it('reports core concepts, gaps and prompts with actions, for a module too', () => {
    const { graph } = service();
    const report = graph.report();
    expect(report.coreConcepts[0]?.node.label).toBe('Raft');
    expect(report.isolated.map((node) => node.label)).toEqual(['CAP theorem', 'Lonely idea']);
    const kinds = report.prompts.map((prompt) => prompt.kind);
    expect(kinds).toContain('verify');
    expect(kinds).toContain('gap');
    const verify = report.prompts.filter((prompt) => prompt.kind === 'verify');
    expect(verify[0]?.title).toBe('Check: “Gradient descent” is an example of “Back-propagation”');
    expect(verify[0]?.actions[0]).toMatchObject({ view: 'relations', node: { id: 'con_sgd' } });
    const gap = report.prompts.find((prompt) => prompt.id === 'gap:con_cap');
    expect(gap?.actions[0]).toMatchObject({ view: 'page', node: { type: 'concept' } });
    expect(graph.report()).toEqual(report); // deterministic

    const ml = graph.report('mod_ml');
    expect(ml.isolated.map((node) => node.label)).toEqual(['Lonely idea']);
    expect(
      ml.coreConcepts.every(({ node }) =>
        ['Gradient descent', 'Back-propagation'].includes(node.label),
      ),
    ).toBe(true);
  });
});
