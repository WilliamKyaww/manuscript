import { readFileSync } from 'node:fs';
import {
  ConceptSummarySchema,
  GraphPathSchema,
  GraphPayloadSchema,
  GraphReportSchema,
  ModuleSummarySchema,
  NoteDetailSchema,
  RelationSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

async function setUp() {
  bed = createSourcesTestbed();
  await bed.start();
  const api = jsonApi(bed.request);
  const module = await api.post(
    '/api/modules',
    { code: 'COC251', title: 'Distributed Systems' },
    201,
    ModuleSummarySchema,
  );
  const concept = (name: string) =>
    api.post('/api/concepts', { name, moduleIds: [module.id] }, 201, ConceptSummarySchema);
  return { api, module, concept };
}

const Relations = z.object({ relations: z.array(RelationSchema) });

describe('relations', () => {
  it('stores typed relations once, in one direction, between things that exist', async () => {
    const { api, concept } = await setUp();
    const paxos = await concept('Paxos');
    const raft = await concept('Raft');
    const cap = await concept('CAP theorem');

    const prerequisite = await api.post(
      '/api/relations',
      { from: paxos.id, to: raft.id, relation: 'prerequisite_for' },
      201,
      RelationSchema,
    );
    expect(prerequisite).toMatchObject({
      from: { type: 'concept', id: paxos.id, label: 'Paxos' },
      to: { id: raft.id, label: 'Raft' },
      confidence: 'USER',
      status: 'accepted',
      createdBy: 'user',
    });
    const reverse = await api.post<{ detail: string }>(
      '/api/relations',
      { from: raft.id, to: paxos.id, relation: 'prerequisite_for' },
      409,
    );
    expect(reverse.detail).toContain('reverse');

    // Symmetric relations are stored smaller id first, whichever way they are given.
    const contrast = await api.post(
      '/api/relations',
      { from: raft.id, to: paxos.id, relation: 'contrasts_with' },
      201,
      RelationSchema,
    );
    expect(contrast.from.id).toBe(paxos.id);
    await api.post(
      '/api/relations',
      { from: paxos.id, to: raft.id, relation: 'contrasts_with' },
      409,
    );

    const note = await api.post(
      '/api/notes',
      { title: 'Consensus', content: '# Consensus\nAgreement.' },
      201,
      NoteDetailSchema,
    );
    await api.post(
      '/api/relations',
      { from: paxos.id, to: note.id, relation: 'prerequisite_for' },
      400,
    );
    await api.post('/api/relations', { from: paxos.id, to: paxos.id, relation: 'relates_to' }, 400);
    await api.post(
      '/api/relations',
      { from: paxos.id, to: 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', relation: 'relates_to' },
      400,
    );
    const covered = await api.post(
      '/api/relations',
      { from: paxos.id, to: note.id, relation: 'covered_in' },
      201,
      RelationSchema,
    );
    expect(covered.to).toMatchObject({ type: 'note', label: 'Consensus' });
    // Relations refer to notes by id, so the id is now in the file.
    expect(readFileSync(bed.abs(note.path), 'utf8')).toContain(`id: ${note.id}`);

    // An inferred proposal, then rejected: it leaves the default list but is kept.
    const proposal = await api.post(
      '/api/relations',
      {
        from: cap.id,
        to: raft.id,
        relation: 'relates_to',
        confidence: 'INFERRED',
        score: 0.65,
        status: 'proposed',
        evidence: [{ quote: 'Raft favours consistency.' }],
      },
      201,
      RelationSchema,
    );
    expect(proposal.evidence).toEqual([{ quote: 'Raft favours consistency.' }]);
    await api.patch(`/api/relations/${proposal.id}`, { status: 'rejected' }, 200, RelationSchema);
    const listed = await api.get(`/api/relations?node=${raft.id}`, Relations);
    expect(listed.relations.map((relation) => relation.relation).sort()).toEqual([
      'contrasts_with',
      'prerequisite_for',
    ]);
    const rejected = await api.get(`/api/relations?node=${raft.id}&status=rejected`, Relations);
    expect(rejected.relations.map((relation) => relation.id)).toEqual([proposal.id]);

    // Deleting a concept takes its relations with it; changes are announced.
    const before = bed.events.filter((event) => event.type === 'data.changed').length;
    await api.delete(`/api/concepts/${raft.id}`);
    expect((await api.get(`/api/relations?node=${paxos.id}`, Relations)).relations).toHaveLength(1);
    await api.delete(`/api/relations/${covered.id}`);
    await api.delete(`/api/relations/${covered.id}`, 404);
    const areas = bed.events
      .slice()
      .flatMap((event) => (event.type === 'data.changed' ? [event.area] : []));
    expect(areas.slice(before)).toEqual(['concepts', 'relations']);
    expect(areas[0]).toBe('course');
  });
});

describe('graph API', () => {
  it('serves the graph, a neighbourhood, paths and the report', async () => {
    const { api, module, concept } = await setUp();
    const paxos = await concept('Paxos');
    const raft = await concept('Raft');
    await concept('Gossip');
    const note = await api.post(
      '/api/notes',
      { title: 'Consensus', content: '# Consensus\n[[Paxos]] before [[Raft]].', module: 'COC251' },
      201,
      NoteDetailSchema,
    );

    const graph = await api.get('/api/graph', GraphPayloadSchema);
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toEqual(expect.arrayContaining([module.id, paxos.id, raft.id, note.id]));
    expect(graph.edges.map((edge) => edge.relation)).toContain('mentioned_in');
    expect(graph.nodes.find((node) => node.id === paxos.id)).toMatchObject({
      type: 'concept',
      modules: ['COC251'],
      degree: 1,
    });

    await api.post(
      '/api/relations',
      { from: paxos.id, to: raft.id, relation: 'prerequisite_for' },
      201,
    );
    const after = await api.get(`/api/graph?types=concept`, GraphPayloadSchema);
    expect(after.version).toBeGreaterThan(graph.version);
    expect(after.nodes.every((node) => node.type === 'concept')).toBe(true);
    expect(after.edges.map((edge) => edge.relation)).toEqual(['prerequisite_for']);

    const local = await api.get(`/api/graph/local?node=${raft.id}&depth=1`, GraphPayloadSchema);
    expect(local.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([raft.id, paxos.id, note.id, module.id]),
    );
    const path = await api.get(`/api/graph/path?from=${paxos.id}&to=${raft.id}`, GraphPathSchema);
    expect(path.nodes.map((node) => node.label)).toEqual(['Paxos', 'Raft']);
    await api.get(`/api/graph/local?node=con_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7`, undefined, 404);

    const report = await api.get(`/api/graph/report?module=${module.id}`, GraphReportSchema);
    expect(report.isolated.map((node) => node.label)).toEqual(['Gossip']);
    expect(report.prompts.find((prompt) => prompt.kind === 'gap')?.title).toBe('Connect “Gossip”');
  });
});
