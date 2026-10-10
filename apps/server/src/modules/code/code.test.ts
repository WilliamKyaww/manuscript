import {
  type CodeImportResult,
  CodeImportResultSchema,
  CodeLinkSchema,
  GraphPayloadSchema,
  ProblemDetailsSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { graphifyBytes, raftRepository } from '../../../test/fixtures/graphify';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

const Links = z.object({ links: z.array(CodeLinkSchema) });

async function setup() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  const { api } = testbed;
  const upload = async (
    bytes: Uint8Array,
    fields: Record<string, string> = {},
    fileName = 'raft-lab.json',
  ) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)]), fileName);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return testbed.bed.request('/api/code/graphs', { method: 'POST', body: form });
  };
  const imported = async (fields: Record<string, string> = {}): Promise<CodeImportResult> => {
    const response = await upload(graphifyBytes(raftRepository()), fields);
    const body = await response.json();
    expect([200, 201], JSON.stringify(body)).toContain(response.status);
    return CodeImportResultSchema.parse(body);
  };
  return { ...testbed, api, upload, imported };
}

describe('importing a Graphify graph', () => {
  it('reads the repository, drops edges to nowhere and suggests links to concepts from names', async () => {
    const { api, imported, raft, concept } = await setup();
    const append = await concept('Append entries');
    await concept('Log replication');

    const result = await imported({ module: 'COC251' });
    expect(result.duplicate).toBe(false);
    expect(result.droppedEdges).toBe(1);
    expect(result.graph).toMatchObject({
      name: 'raft-lab',
      fileName: 'raft-lab.json',
      entities: 7,
      edges: 5,
      module: { code: 'COC251' },
      links: { proposed: 3, accepted: 0 },
    });

    // Raft: the file raft.py (exact) and RaftNode (contains); Append entries: the function (exact).
    const raftLinks = await api.get(`/api/concepts/${raft.id}/code`, Links);
    expect(raftLinks.links.map((link) => [link.entity.label, link.status, link.score])).toEqual([
      ['raft.py', 'proposed', 0.9],
      ['RaftNode', 'proposed', 0.6],
    ]);
    expect(raftLinks.links[0]?.reason).toBe('The name “raft.py” is the same as “Raft”.');
    const appendLinks = await api.get(`/api/concepts/${append.id}/code`, Links);
    expect(appendLinks.links.map((link) => link.entity.label)).toEqual(['append_entries()']);

    // Searching the code: by name, or by the file it is in.
    const search = await api.get<{ entities: { label: string; kind: string }[]; total: number }>(
      '/api/code/entities?q=RaftNode',
    );
    expect(search.entities.map((entity) => entity.label)).toEqual(['RaftNode']);
    const byFile = await api.get<{ total: number }>('/api/code/entities?q=src%2Fraft.py');
    expect(byFile.total).toBe(4);
    const rationale = await api.get<{ entities: { label: string }[] }>(
      '/api/code/entities?kind=rationale',
    );
    expect(rationale.entities.map((entity) => entity.label)).toEqual([
      'Randomised timeouts avoid split votes',
    ]);
  });

  it('knows a file it has imported, and refuses what is not a graph', async () => {
    const { api, upload, imported } = await setup();
    await imported();
    expect((await imported()).duplicate).toBe(true);
    expect((await api.get<{ graphs: unknown[] }>('/api/code/graphs')).graphs).toHaveLength(1);

    const notJson = await upload(new TextEncoder().encode('{ not json'));
    expect(notJson.status).toBe(400);
    expect(ProblemDetailsSchema.parse(await notJson.json()).detail).toMatch(/not valid JSON/u);
    const notGraph = await upload(new TextEncoder().encode('{"hello": 1}'));
    expect(notGraph.status).toBe(400);
    const wrongModule = await upload(graphifyBytes({ nodes: [{ id: 'a' }] }), {
      module: 'NOPE999',
    });
    expect(wrongModule.status).toBe(400);
  });
});

describe('deciding which code implements a concept', () => {
  it('accepts, rejects, links by hand and unlinks, and a rejected match is not suggested again', async () => {
    const { api, imported, raft, paxos } = await setup();
    const graph = (await imported()).graph;
    const entities = (
      await api.get<{ entities: { id: string; label: string }[] }>('/api/code/entities?limit=100')
    ).entities;
    const id = (label: string) => entities.find((entity) => entity.label === label)?.id as string;

    await api.put(
      `/api/concepts/${raft.id}/code/${id('raft.py')}`,
      { status: 'accepted' },
      200,
      CodeLinkSchema,
    );
    await api.put(
      `/api/concepts/${raft.id}/code/${id('RaftNode')}`,
      { status: 'rejected' },
      200,
      CodeLinkSchema,
    );
    // By hand, a concept with no suggestion at all.
    await api.post(
      `/api/concepts/${paxos.id}/code`,
      { entityId: id('.elect_leader()') },
      201,
      CodeLinkSchema,
    );
    await api.post(`/api/concepts/${paxos.id}/code`, { entityId: id('.elect_leader()') }, 409);

    const shown = await api.get(`/api/concepts/${raft.id}/code`, Links);
    expect(shown.links.map((link) => [link.entity.label, link.status])).toEqual([
      ['raft.py', 'accepted'],
    ]);
    const listed = await api.get<{ graphs: { links: { proposed: number; accepted: number } }[] }>(
      '/api/code/graphs',
    );
    expect(listed.graphs[0]?.links).toEqual({ proposed: 0, accepted: 2 });

    // New concept names are matched on request; what was rejected stays rejected.
    const again = await api.post<{ proposed: number }>(
      `/api/code/graphs/${graph.id}/rematch`,
      undefined,
      200,
    );
    expect(again.proposed).toBe(0);
    const entity = await api.get<{
      entity: { label: string };
      edges: { direction: string; relation: string; other: { label: string } }[];
      concepts: { name: string }[];
    }>(`/api/code/entities/${id('.elect_leader()')}`);
    expect(entity.concepts.map((concept) => concept.name)).toEqual(['Paxos']);
    expect(entity.edges.map((edge) => [edge.direction, edge.relation, edge.other.label])).toEqual([
      ['out', 'calls', 'append_entries()'],
      ['in', 'contains', 'RaftNode'],
      ['in', 'rationale_for', 'Randomised timeouts avoid split votes'],
    ]);

    await api.delete(`/api/concepts/${paxos.id}/code/${id('.elect_leader()')}`);
    await api.delete(`/api/concepts/${paxos.id}/code/${id('.elect_leader()')}`, 404);
  });

  it('follows a concept that is merged into another, and goes with a concept that is deleted', async () => {
    const { api, imported, raft, paxos, bed: testbed } = await setup();
    await imported();
    const second = await api.post<{ id: string }>('/api/concepts', { name: 'Raft protocol' }, 201);
    // "Raft protocol" contains "Raft" only the other way round: link one entity to it by hand.
    const entities = (
      await api.get<{ entities: { id: string; label: string }[] }>('/api/code/entities?q=RaftNode')
    ).entities;
    await api.post(`/api/concepts/${second.id}/code`, { entityId: entities[0]?.id }, 201);

    // Merging Raft protocol into Raft: its code link moves, and undoing the merge puts it back.
    const { snapshot } = testbed.modules.concepts.merge(raft.id, second.id);
    const kept = await api.get(`/api/concepts/${raft.id}/code`, Links);
    expect(kept.links.map((link) => link.entity.label)).toContain('RaftNode');
    testbed.modules.concepts.unmerge(snapshot);
    const restored = await api.get(`/api/concepts/${second.id}/code`, Links);
    expect(restored.links.map((link) => link.entity.label)).toEqual(['RaftNode']);

    // Deleting a concept takes its links with it; the code stays.
    await api.delete(`/api/concepts/${paxos.id}`);
    await api.delete(`/api/concepts/${second.id}`);
    expect((await api.get<{ total: number }>('/api/code/entities?limit=1')).total).toBe(7);
  });

  it('is removed together with its links when the graph is deleted', async () => {
    const { api, imported, raft } = await setup();
    const graph = (await imported()).graph;
    expect((await api.get(`/api/concepts/${raft.id}/code`, Links)).links).not.toHaveLength(0);
    await api.delete(`/api/code/graphs/${graph.id}`);
    expect((await api.get(`/api/concepts/${raft.id}/code`, Links)).links).toEqual([]);
    expect((await api.get<{ total: number }>('/api/code/entities')).total).toBe(0);
  });
});

describe('code in the knowledge graph', () => {
  it('is left out unless asked for, and shows what implements a concept and what uses what', async () => {
    const { api, imported, raft } = await setup();
    await imported();
    const entities = (
      await api.get<{ entities: { id: string; label: string }[] }>('/api/code/entities?limit=100')
    ).entities;
    const id = (label: string) => entities.find((entity) => entity.label === label)?.id as string;
    await api.put(`/api/concepts/${raft.id}/code/${id('RaftNode')}`, { status: 'accepted' }, 200);

    const usual = await api.get('/api/graph', GraphPayloadSchema);
    expect(usual.nodes.some((node) => node.type === 'code')).toBe(false);

    const withCode = await api.get(
      '/api/graph?types=concept&types=code&isolated=true',
      GraphPayloadSchema,
    );
    const code = withCode.nodes.filter((node) => node.type === 'code');
    expect(code.map((node) => node.label).sort()).toContain('RaftNode');
    const implemented = withCode.edges.filter((edge) => edge.relation === 'implemented_in');
    expect(implemented.map((edge) => [edge.source, edge.target])).toEqual([
      [raft.id, id('RaftNode')],
    ]);
    // What is only suggested waits for a decision (and shows when proposals are asked for).
    const proposals = await api.get(
      '/api/graph?types=concept&types=code&status=accepted&status=proposed&isolated=true',
      GraphPayloadSchema,
    );
    expect(
      proposals.edges.filter(
        (edge) => edge.relation === 'implemented_in' && edge.status === 'proposed',
      ),
    ).toHaveLength(1);
    // Calls are drawn as "uses"; containment is course-like structure and stays out of analytics.
    expect(withCode.edges.some((edge) => edge.relation === 'uses')).toBe(true);
    // Code is shown, not analysed: it has no community of its own among the ideas.
    expect(code.every((node) => node.community === null)).toBe(true);
  });
});
