import {
  CardSchema,
  DraftsSchema,
  PipelineRunSchema,
  ProgressOverviewSchema,
  ProposalSchema,
  StudyPlanSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { makePptx } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

const SLIDES = [
  {
    title: 'Two-phase commit',
    body: ['Two-phase commit is an atomic commitment protocol for distributed transactions.'],
  },
  {
    title: 'The coordinator',
    body: ['The coordinator is the node that collects a vote from every participant.'],
  },
  {
    title: 'Blocking',
    body: ['A participant is blocked when the coordinator fails after the votes are cast.'],
  },
];

const Proposals = z.object({ proposals: z.array(ProposalSchema) });
const Run = z.object({ run: PipelineRunSchema.nullable() });

describe('the study loop with the test model', () => {
  it('lecture → proposals → accepted → cards → review → mastery → a plan that reflects it', async () => {
    bed = createSourcesTestbed({ config: { aiMock: true } });
    await bed.start();
    const imported = await bed.imported('commit.pptx', makePptx(SLIDES));
    await bed.settle();
    const api = jsonApi(bed.request);
    const module = await api.post<{ id: string }>('/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
      credits: 15,
    });
    await api.post(`/api/modules/${module.id}/assessments`, {
      title: 'Exam',
      kind: 'exam',
      weight: 1,
      dueAt: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
    });
    const lecture = await api.post<{ id: string }>(`/api/modules/${module.id}/lectures`, {
      key: 'L3',
      title: 'Commit protocols',
    });
    await api.post(`/api/lectures/${lecture.id}/sources`, { sourceId: imported.source.id }, 200);

    // Before anything: only the lecture to work through, and a mock exam to sit.
    const before = await api.post('/api/plan/generate', { days: 3 }, 200, StudyPlanSchema);
    expect(before.items.map((item) => item.kind).sort()).toEqual(['learn', 'mock_exam']);
    expect(before.items.find((item) => item.kind === 'learn')?.title).toContain('CS301 L3');

    // 1. The pipeline turns the lecture into suggestions and drafts.
    await api.post(`/api/lectures/${lecture.id}/pipeline`, {}, 201);
    await bed.settle();
    expect((await api.get(`/api/lectures/${lecture.id}/pipeline`, Run)).run?.status).toBe('done');
    const pending = await api.get('/api/proposals', Proposals);
    expect(pending.proposals.some((proposal) => proposal.kind === 'concept')).toBe(true);

    // 2. Accepting them puts the concepts and the lecture note into the knowledge base.
    await api.post(
      '/api/proposals/bulk',
      { ids: pending.proposals.map((proposal) => proposal.id), action: 'accept' },
      200,
    );
    const concepts = await api.get<{ concepts: { id: string; name: string }[] }>('/api/concepts');
    expect(concepts.concepts.length).toBeGreaterThan(0);

    // 3. Cards made now know the concepts, and wait as drafts until accepted.
    await api.post(`/api/lectures/${lecture.id}/pipeline`, { steps: ['cards'] }, 201);
    await bed.settle();
    const drafts = await api.get('/api/drafts', DraftsSchema);
    const linked = drafts.cards.filter((card) => card.concepts.length > 0);
    expect(linked.length).toBeGreaterThan(0);
    await api.post('/api/drafts/accept', { cardIds: linked.map((card) => card.id) }, 200);

    // 4. Reviewing one makes mastery appear for its concept.
    const queue = await api.get<{ items: { cardId: string; ordinal: number }[] }>(
      '/api/review/queue',
    );
    expect(queue.items.length).toBeGreaterThan(0);
    const first = queue.items[0];
    await api.post(
      '/api/reviews',
      { cardId: first?.cardId, ordinal: first?.ordinal, rating: 3, durationMs: 4_000 },
      201,
    );
    const card = await api.get(`/api/cards/${first?.cardId}`, CardSchema);
    const progress = await api.get('/api/progress', ProgressOverviewSchema);
    const known = progress.modules[0]?.concepts.filter(
      (row) =>
        row.components.mastery !== null && card.concepts.some((c) => c.id === row.concept.id),
    );
    expect(known?.length).toBeGreaterThan(0);

    // 5. And the plan now has something to say: the card to review and concepts to practise.
    const plan = await api.post('/api/plan/generate', { days: 3 }, 200, StudyPlanSchema);
    const kinds = new Set(plan.items.map((item) => item.kind));
    expect(kinds).toContain('review');
    expect(kinds).toContain('practice');
    // The lecture has material to study from now, so it is no longer something to work through.
    expect(kinds).not.toContain('learn');
    for (const item of plan.items) expect(item.reason.length).toBeGreaterThan(10);
  });
});
