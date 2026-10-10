import {
  DraftsSchema,
  PipelineRunSchema,
  PipelineSettingsSchema,
  type ProposalSchema,
  QuizSummarySchema,
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
    title: 'Two-phase commit (2PC)',
    body: ['Two-phase commit is an atomic commitment protocol for distributed transactions.'],
  },
  {
    title: 'Coordinator',
    body: ['The coordinator collects a vote from every participant before deciding the outcome.'],
  },
  {
    title: 'Blocking',
    body: ['A participant blocks when the coordinator fails after the voting phase completes.'],
  },
];

const Run = z.object({ run: PipelineRunSchema.nullable() });

async function setUp(options: { mock?: boolean; attach?: boolean } = {}) {
  bed = createSourcesTestbed({ config: { aiMock: options.mock ?? true } });
  await bed.start();
  const imported = await bed.imported('consensus.pptx', makePptx(SLIDES));
  await bed.settle();
  const api = jsonApi(bed.request);
  const module = await api.post<{ id: string }>('/api/modules', {
    code: 'CS301',
    title: 'Distributed Systems',
  });
  const lecture = await api.post<{ id: string }>(`/api/modules/${module.id}/lectures`, {
    key: 'L3',
    title: 'Consensus',
  });
  const attach = () =>
    api.post(`/api/lectures/${lecture.id}/sources`, { sourceId: imported.source.id }, 200);
  if (options.attach !== false) await attach();
  return { api, bed, lecture, module, attach, sourceId: imported.source.id };
}

describe('the lecture pipeline', () => {
  it('takes a lecture’s material to a note, concepts, cards, questions and a quiz, all waiting in the Inbox', async () => {
    const { api, bed: testbed, lecture, module } = await setUp();
    const started = await api.post(
      `/api/lectures/${lecture.id}/pipeline`,
      {},
      201,
      PipelineRunSchema,
    );
    expect(started).toMatchObject({ status: 'queued', trigger: 'manual', lectureId: lecture.id });
    expect(started.steps.map((step) => step.step)).toEqual([
      'note',
      'concepts',
      'cards',
      'questions',
      'quiz',
    ]);
    await testbed.settle();

    const { run } = await api.get(`/api/lectures/${lecture.id}/pipeline`, Run);
    expect(run?.status).toBe('done');
    expect(run?.steps.map((step) => [step.step, step.status])).toEqual([
      ['note', 'done'],
      ['concepts', 'done'],
      ['cards', 'done'],
      ['questions', 'done'],
      ['quiz', 'done'],
    ]);
    expect(run?.steps.find((step) => step.step === 'cards')?.summary).toMatch(
      /ready to review in the Inbox/u,
    );
    expect(run?.message).toMatch(/5 of 5 steps made something/u);

    // The material is drafts and suggestions; nothing is studied or in the vault yet.
    const drafts = await api.get('/api/drafts', DraftsSchema);
    expect(drafts.cards.length).toBeGreaterThan(0);
    expect(drafts.questions.length).toBeGreaterThan(0);
    const pending = await api.get<{ proposals: z.infer<typeof ProposalSchema>[] }>(
      '/api/proposals',
    );
    expect(new Set(pending.proposals.map((proposal) => proposal.kind))).toEqual(
      new Set(['note', 'concept', 'relation']),
    );
    const quizzes = await api.get(
      '/api/quizzes',
      z.object({ quizzes: z.array(QuizSummarySchema) }),
    );
    expect(quizzes.quizzes).toHaveLength(1);
    expect(quizzes.quizzes[0]).toMatchObject({
      title: 'CS301 L3 — Consensus',
      questionCount: drafts.questions.length,
      module: { id: module.id },
    });
  });

  it('runs only the steps asked for, and says what it skipped', async () => {
    const { api, bed: testbed, lecture } = await setUp();
    await api.post(`/api/lectures/${lecture.id}/pipeline`, { steps: ['cards'] }, 201);
    await testbed.settle();
    const { run } = await api.get(`/api/lectures/${lecture.id}/pipeline`, Run);
    expect(run?.steps.map((step) => step.status)).toEqual([
      'skipped',
      'skipped',
      'done',
      'skipped',
      'skipped',
    ]);
    expect(run?.steps[0]?.summary).toBe('Switched off.');
    expect((await api.get('/api/drafts', DraftsSchema)).questions).toEqual([]);
  });

  it('follows the step settings, and a quiz needs questions', async () => {
    const { api, bed: testbed, lecture } = await setUp();
    const settings = await api.patch(
      '/api/settings/pipeline',
      { note: false, concepts: false, cards: false, questions: false },
      200,
      PipelineSettingsSchema,
    );
    expect(settings).toMatchObject({ autoRun: false, quiz: true, note: false });
    await api.post(`/api/lectures/${lecture.id}/pipeline`, {}, 201);
    await testbed.settle();
    const { run } = await api.get(`/api/lectures/${lecture.id}/pipeline`, Run);
    expect(run?.steps.find((step) => step.step === 'quiz')).toMatchObject({
      status: 'skipped',
      summary: expect.stringMatching(/nothing to put in a quiz/u),
    });
    await api.patch('/api/settings/pipeline', { quiz: false }, 200);
    // Every step off is not a request.
    await api.post(`/api/lectures/${lecture.id}/pipeline`, {}, 400);
  });

  it('refuses at once when there is no material, no model, or nothing to run', async () => {
    const empty = await setUp({ attach: false });
    await empty.api.post(`/api/lectures/${empty.lecture.id}/pipeline`, {}, 400);
    bed?.cleanup();

    const off = await setUp({ mock: false });
    const response = await off.bed.request(`/api/lectures/${off.lecture.id}/pipeline`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).not.toBe(201);
    expect((await off.api.get(`/api/lectures/${off.lecture.id}/pipeline`, Run)).run).toBeNull();
  });

  it('runs by itself when material is attached, only if switched on, and only once for the same material', async () => {
    const { api, bed: testbed, lecture, attach } = await setUp({ attach: false });
    // Off by default: attaching does nothing.
    await attach();
    await testbed.settle();
    expect((await api.get(`/api/lectures/${lecture.id}/pipeline`, Run)).run).toBeNull();

    await api.patch('/api/settings/pipeline', { autoRun: true, quiz: false }, 200);
    await api.delete(
      `/api/lectures/${lecture.id}/sources/${testbed.ctx.db.get<{ source_id: string }>('SELECT source_id FROM lecture_sources LIMIT 1')?.source_id}`,
    );
    await attach();
    await testbed.settle();
    const first = (await api.get(`/api/lectures/${lecture.id}/pipeline`, Run)).run;
    expect(first).toMatchObject({ trigger: 'auto', status: 'done' });

    // The same material again does not run it again.
    await api.delete(
      `/api/lectures/${lecture.id}/sources/${testbed.ctx.db.get<{ source_id: string }>('SELECT source_id FROM lecture_sources LIMIT 1')?.source_id}`,
    );
    await attach();
    await testbed.settle();
    expect((await api.get(`/api/lectures/${lecture.id}/pipeline`, Run)).run?.id).toBe(first?.id);
  });
});
