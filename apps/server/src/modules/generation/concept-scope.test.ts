import { DraftsSchema, GenerationEstimateSchema, JobSummarySchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonApi } from '../../../test/api-helpers';
import { makePptx } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

const SLIDES = [
  { title: 'Overview', body: ['A tour of the week, with nothing in it about voting.'] },
  {
    title: 'The coordinator',
    body: ['The coordinator collects a vote from every participant before deciding the outcome.'],
  },
  { title: 'Blocking', body: ['A participant blocks when the coordinator fails after the votes.'] },
];

describe('questions for a concept from what names it', () => {
  it('works from the passages of the sources that name the concept, and says when there are none', async () => {
    bed = createSourcesTestbed({ config: { aiMock: true } });
    await bed.start();
    await bed.imported('commit.pptx', makePptx(SLIDES));
    await bed.settle();
    const api = jsonApi(bed.request);
    const named = await api.post<{ id: string }>('/api/concepts', { name: 'Coordinator' }, 201);
    const unnamed = await api.post<{ id: string }>(
      '/api/concepts',
      { name: 'Gossip protocol' },
      201,
    );

    const estimate = await api.post(
      '/api/ai/generate/estimate',
      { task: 'questions', scope: { kind: 'concept', conceptId: named.id } },
      200,
      GenerationEstimateSchema,
    );
    expect(estimate.problem).toBeNull();
    // The two slides that name it, not the overview.
    expect(estimate.passages).toBe(2);

    const none = await api.post(
      '/api/ai/generate/estimate',
      { task: 'questions', scope: { kind: 'concept', conceptId: unnamed.id } },
      200,
      GenerationEstimateSchema,
    );
    expect(none).toMatchObject({ passages: 0, problem: expect.stringMatching(/no text/u) });

    const job = await api.post(
      '/api/ai/generate',
      { task: 'questions', scope: { kind: 'concept', conceptId: named.id }, count: 3 },
      201,
      JobSummarySchema,
    );
    expect(job.subject).toBe(named.id);
    await bed.settle();
    const drafts = await api.get('/api/drafts', DraftsSchema);
    expect(drafts.questions.length).toBeGreaterThan(0);
  });
});
