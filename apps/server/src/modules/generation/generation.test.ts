import {
  type Drafts,
  DraftsSchema,
  GenerationEstimateSchema,
  JobSummarySchema,
  type Proposal,
  ProposalSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { makePptx } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { passageFor } from './tasks';

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
  { title: 'Paxos', body: ['Paxos reaches agreement through numbered ballots run by proposers.'] },
];

const Proposals = z.object({ proposals: z.array(ProposalSchema) });

async function setUp(options: { mock?: boolean } = {}) {
  bed = createSourcesTestbed({ config: { aiMock: options.mock ?? true } });
  await bed.start();
  const imported = await bed.imported('consensus.pptx', makePptx(SLIDES));
  await bed.settle();
  const api = jsonApi(bed.request);
  return { bed, api, sourceId: imported.source.id };
}

/** Starts a generation and runs its job. */
async function generate(api: ReturnType<typeof jsonApi>, body: Record<string, unknown>) {
  const job = await api.post('/api/ai/generate', body, 201, JobSummarySchema);
  await bed?.settle();
  return bed?.modules.jobs.get(job.id);
}

describe('generation', () => {
  it('estimates the material and cost before anything is spent', async () => {
    const { api, sourceId } = await setUp();
    const estimate = await api.post(
      '/api/ai/generate/estimate',
      { task: 'cards', scope: { kind: 'source', sourceId, from: 1, to: 3 }, count: 5 },
      200,
      GenerationEstimateSchema,
    );
    expect(estimate).toMatchObject({
      passages: 3,
      truncated: false,
      outputTokens: 450,
      cost: null,
      model: 'Test model (mock)',
      problem: null,
    });
    expect(estimate.inputTokens).toBeGreaterThan(estimate.materialTokens);
  });

  it('refuses to start without AI, saying why', async () => {
    const { api, sourceId } = await setUp({ mock: false });
    const estimate = await api.post(
      '/api/ai/generate/estimate',
      { task: 'cards', scope: { kind: 'source', sourceId } },
      200,
      GenerationEstimateSchema,
    );
    expect(estimate.problem).toMatch(/Choose a provider/u);
    const refused = await api.post(
      '/api/ai/generate',
      { task: 'cards', scope: { kind: 'source', sourceId } },
      409,
    );
    expect(refused).toMatchObject({ code: 'ai_not_configured' });
  });

  it('makes draft flashcards from the first three slides, each with its slide as locator', async () => {
    const { api, sourceId } = await setUp();
    const job = await generate(api, {
      task: 'cards',
      scope: { kind: 'source', sourceId, from: 1, to: 3 },
      count: 10,
    });
    expect(job).toMatchObject({ status: 'succeeded', progress: 1 });
    expect(job?.message).toMatch(/3 cards ready to review in the Inbox/u);
    const drafts: Drafts = await api.get('/api/drafts', DraftsSchema);
    expect(drafts.cards).toHaveLength(3);
    for (const card of drafts.cards) {
      expect(card.status).toBe('draft');
      expect(card.createdBy).toBe('ai');
      expect(card.locator).toMatchObject({ kind: 'slides', sourceId });
      expect(card.locator?.kind === 'slides' && card.locator.slide).toBeLessThanOrEqual(3);
    }
    // Drafts are not studied until accepted.
    const before = await api.get<{ items: unknown[] }>('/api/review/queue');
    expect(before.items).toHaveLength(0);
    const counts = await api.get('/api/inbox/counts');
    expect(counts).toEqual({ drafts: 3, proposals: 0 });

    const accepted = await api.post(
      '/api/drafts/accept',
      { cardIds: drafts.cards.slice(0, 2).map((card) => card.id) },
      200,
    );
    expect(accepted).toEqual({ cards: 2, questions: 0 });
    await api.post('/api/drafts/reject', { cardIds: [drafts.cards[2]?.id] }, 200);
    const after = await api.get<{ items: unknown[] }>('/api/review/queue');
    expect(after.items.length).toBeGreaterThanOrEqual(2);
    expect(await api.get('/api/inbox/counts')).toEqual({ drafts: 0, proposals: 0 });

    // Generating again flags the cards that repeat ones already in use.
    await generate(api, { task: 'cards', scope: { kind: 'source', sourceId, from: 1, to: 1 } });
    const again = await api.get('/api/drafts', DraftsSchema);
    expect(again.cards[0]?.duplicateOf?.id).toBe(drafts.cards[0]?.id);
  });

  it('leaves no empty card set behind when nothing usable comes back', async () => {
    const { api, sourceId } = await setUp();
    const job = await generate(api, {
      task: 'cards',
      scope: {
        kind: 'selection',
        text: 'Too short.',
        title: 'Consensus',
        locator: { kind: 'slides', sourceId, slide: 1, part: 'body' },
      },
    });
    expect(job?.message).toMatch(/^0 cards/u);
    const sets = await api.get<{ sets: unknown[] }>('/api/card-sets');
    expect(sets.sets).toEqual([]);
  });

  it('makes questions with valid answer keys, in the lecture’s module', async () => {
    const { api, sourceId } = await setUp();
    const module = await api.post<{ id: string }>('/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
    });
    const lecture = await api.post<{ id: string }>(`/api/modules/${module.id}/lectures`, {
      key: 'L3',
      title: 'Consensus',
    });
    await api.post(`/api/lectures/${lecture.id}/sources`, { sourceId }, 200);
    await generate(api, {
      task: 'questions',
      scope: { kind: 'lecture', lectureId: lecture.id },
      count: 4,
      questionKinds: ['mcq', 'true_false', 'short'],
    });
    const { questions } = await api.get('/api/drafts', DraftsSchema);
    expect(questions.map((question) => question.kind).sort()).toEqual([
      'mcq',
      'mcq',
      'short',
      'true_false',
    ]);
    for (const question of questions) {
      expect(question.module?.id).toBe(module.id);
      expect(question.lecture?.id).toBe(lecture.id);
      expect(question.locator).toMatchObject({ kind: 'slides', sourceId });
      if (question.answer.kind === 'mcq')
        expect(question.answer.options.filter((option) => option.correct)).toHaveLength(1);
    }
    // Card sets made for a lecture are named after it.
    await generate(api, { task: 'cards', scope: { kind: 'lecture', lectureId: lecture.id } });
    const sets = await api.get<{ sets: { title: string; origin: string }[] }>('/api/card-sets');
    expect(sets.sets).toContainEqual(
      expect.objectContaining({ title: 'L3 — Consensus', origin: 'ai' }),
    );
  });

  it('writes a note proposal with citations as links to the slides', async () => {
    const { api, sourceId } = await setUp();
    await api.post('/api/concepts', { name: 'Paxos' });
    await generate(api, { task: 'note', scope: { kind: 'source', sourceId } });
    const { proposals } = await api.get('/api/proposals', Proposals);
    const note = proposals.find((proposal) => proposal.kind === 'note');
    expect(note?.payload.kind).toBe('note');
    if (note?.payload.kind !== 'note') return;
    expect(note.payload.content).toContain('generated_by: ai');
    expect(note.payload.content).toContain('[[Sources/');
    expect(note.payload.content).toMatch(/\(\[\[Sources\/[^|]+\.pptx\|Slide 1\]\]\)/u);
    expect(note.payload.content).toContain('[[Paxos]]');
    expect(note.payload.content).not.toMatch(/\[S\d+\]/u);
    expect(note.evidence.length).toBeGreaterThan(0);

    const accepted = await api.post<Proposal>(`/api/proposals/${note.id}/accept`, {}, 200);
    expect(accepted).toMatchObject({ status: 'accepted', result: { kind: 'note' } });
    const created = await api.get<{ content: string; title: string }>(
      `/api/notes/${accepted.result?.id}`,
    );
    expect(created.content).toContain('[[Paxos]]');
  });
});

describe('concept extraction and the Inbox', () => {
  it('proposes concepts and relations with evidence, merging names that already exist', async () => {
    const { api, sourceId } = await setUp();
    const existing = await api.post<{ id: string }>('/api/concepts', { name: 'Coordinators' });
    await generate(api, { task: 'concepts', scope: { kind: 'source', sourceId } });
    const { proposals } = await api.get('/api/proposals', Proposals);
    const concepts = proposals.filter((proposal) => proposal.kind === 'concept');
    expect(
      concepts.map((proposal) => proposal.payload.kind === 'concept' && proposal.payload.name),
    ).toEqual(['Two-phase commit', 'Blocking', 'Paxos']);
    const twoPhase = concepts[0];
    expect(twoPhase?.payload).toMatchObject({ aliases: ['2PC'] });
    expect(twoPhase?.evidence[0]).toMatchObject({
      label: 'Slide 1',
      locator: { kind: 'slides', sourceId, slide: 1 },
    });
    // "Coordinator" is "Coordinators" in the singular: the same concept, so it is not proposed.
    expect(proposals.some((proposal) => proposal.kind === 'alias')).toBe(false);
    const relations = proposals.filter((proposal) => proposal.kind === 'relation');
    expect(relations[0]?.payload).toMatchObject({
      relation: 'prerequisite_for',
      confidence: 'EXTRACTED',
      from: { proposalId: twoPhase?.id },
      to: { conceptId: existing.id },
    });

    // Accepting a relation accepts the proposed concept at its end, covered by the source.
    const relation = relations[0];
    const accepted = await api.post<Proposal>(`/api/proposals/${relation?.id}/accept`, {}, 200);
    expect(accepted.status).toBe('accepted');
    const concept = await api.get<{ name: string }>(
      `/api/concepts/${(await api.get('/api/proposals?status=accepted', Proposals)).proposals.find((p) => p.kind === 'concept')?.result?.id}`,
    );
    expect(concept.name).toBe('Two-phase commit');

    // Rejecting a concept supersedes the relations that needed it, and it is not proposed again.
    const blocking = concepts[1];
    await api.post(`/api/proposals/${blocking?.id}/reject`, undefined, 200);
    const pending = (await api.get('/api/proposals', Proposals)).proposals;
    expect(pending.some((proposal) => proposal.id === blocking?.id)).toBe(false);
    expect(
      pending.filter(
        (proposal) =>
          proposal.payload.kind === 'relation' &&
          (proposal.payload.from.proposalId === blocking?.id ||
            proposal.payload.to.proposalId === blocking?.id),
      ),
    ).toHaveLength(0);
    await generate(api, { task: 'concepts', scope: { kind: 'source', sourceId } });
    const again = (await api.get('/api/proposals', Proposals)).proposals;
    expect(
      again.filter(
        (proposal) => proposal.payload.kind === 'concept' && proposal.payload.name === 'Blocking',
      ),
    ).toHaveLength(0);

    // Bulk accept: concepts first, then the relations between them.
    const bulk = await api.post<{ done: number; failed: string[] }>(
      '/api/proposals/bulk',
      { ids: again.map((proposal) => proposal.id), action: 'accept' },
      200,
    );
    expect(bulk.failed).toEqual([]);
    expect((await api.get('/api/proposals', Proposals)).proposals).toHaveLength(0);
  });

  it('proposes a merge for a near spelling, and merges a concept into another on request', async () => {
    const { api, sourceId } = await setUp();
    const paxos = await api.post<{ id: string }>('/api/concepts', { name: 'Paxo protocol' });
    await api.post('/api/concepts', { name: 'Blockin' });
    await generate(api, { task: 'concepts', scope: { kind: 'source', sourceId } });
    const { proposals } = await api.get('/api/proposals', Proposals);
    const alias = proposals.find((proposal) => proposal.kind === 'alias');
    expect(alias?.payload).toMatchObject({
      conceptName: 'Blockin',
      alias: 'Blocking',
      judged: false,
    });
    const concept = proposals.find(
      (proposal) => proposal.payload.kind === 'concept' && proposal.payload.name === 'Paxos',
    );
    const merged = await api.post<Proposal>(
      `/api/proposals/${concept?.id}/accept`,
      { mergeInto: paxos.id },
      200,
    );
    expect(merged.result).toEqual({ kind: 'concept', id: paxos.id });
    const detail = await api.get<{ aliases: string[] }>(`/api/concepts/${paxos.id}`);
    expect(detail.aliases).toContain('Paxos');
  });

  it('suggests links for unlinked mentions and inserts them on acceptance', async () => {
    const { api } = await setUp();
    await api.post('/api/concepts', { name: 'Paxos' });
    const target = await api.post<{ id: string }>('/api/notes', { title: 'Raft' });
    const note = await api.post<{ id: string }>('/api/notes', {
      title: 'Consensus',
      content: 'Raft and Paxos both elect leaders.\n',
    });
    const result = await api.post('/api/ai/link-suggestions', { noteId: note.id }, 200);
    expect(result).toEqual({ created: 2 });
    const { proposals } = await api.get('/api/proposals?kind=link', Proposals);
    expect(
      proposals
        .map((proposal) => proposal.payload.kind === 'link' && proposal.payload.target.title)
        .sort(),
    ).toEqual(['Paxos', 'Raft']);
    await api.post(
      '/api/proposals/bulk',
      { ids: proposals.map((p) => p.id), action: 'accept' },
      200,
    );
    const after = await api.get<{ content: string }>(`/api/notes/${note.id}`);
    expect(after.content).toBe('[[Raft]] and [[Paxos]] both elect leaders.\n');
    expect(target.id).toBeTruthy();
    // Suggesting again finds nothing new: both are linked now.
    expect(await api.post('/api/ai/link-suggestions', { noteId: note.id }, 200)).toEqual({
      created: 0,
    });
  });
});

describe('AI grading', () => {
  it('suggests a grade that only counts once the student accepts it', async () => {
    const { api } = await setUp();
    const question = await api.post<{ id: string }>('/api/questions', {
      stem: 'Why can two-phase commit block?',
      answer: {
        kind: 'explain',
        model: 'The participants wait for the coordinator, which may have failed.',
      },
    });
    const quiz = await api.post<{ id: string }>('/api/quizzes', {
      kind: 'practice',
      config: { count: 1 },
    });
    const attempt = await api.post<{ id: string }>(`/api/quizzes/${quiz.id}/attempts`, undefined);
    const answer = await api.post<{ id: string; score: number | null }>(
      `/api/attempts/${attempt.id}/answers`,
      {
        questionId: question.id,
        response: {
          kind: 'explain',
          text: 'Participants wait for the coordinator, which may have failed.',
        },
      },
    );
    expect(answer.score).toBeNull();
    const suggestion = await api.post<{ score: number; feedback: string }>(
      `/api/answers/${answer.id}/ai-grade`,
      undefined,
      200,
    );
    expect(suggestion.score).toBe(1);
    expect(suggestion.feedback).toBeTruthy();
    const graded = await api.post<{ score: number; gradedBy: string; feedback: string }>(
      `/api/answers/${answer.id}/grade`,
      { score: suggestion.score, gradedBy: 'ai', feedback: suggestion.feedback },
      200,
    );
    expect(graded).toMatchObject({ score: 1, gradedBy: 'ai', feedback: suggestion.feedback });
    await api.post(`/api/answers/${answer.id}/ai-grade`, undefined, 409);
  });
});

describe('passages', () => {
  it('finds the passage an item names, however it is written', () => {
    const passages = [{ key: 'S1' }, { key: 'S2' }] as never[];
    expect(passageFor(passages, '[s2]')).toEqual({ key: 'S2' });
    expect(passageFor(passages, 'S9')).toBeNull();
    expect(passageFor([{ key: 'S1' }] as never[], 'unknown')).toEqual({ key: 'S1' });
  });
});
