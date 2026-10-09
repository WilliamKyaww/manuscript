import { AnswerResultSchema, AttemptSchema, QuizSummarySchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

async function setUp() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  return testbed;
}

describe('practice attempts', () => {
  it('grades as you go, waits for your own grade on open answers, and scores at the end', async () => {
    const { api, raft, mcq, short, explain, quiz, attempt, answer, refuse } = await setUp();
    const choice = await mcq([raft.id]);
    const phrase = await short([raft.id]);
    const essay = await explain([raft.id]);
    const built = await quiz({ kind: 'practice', config: { count: 3 } });
    const started = await attempt(built.id);
    // Before answering, the key is not sent.
    expect(started.items.every((item) => item.answer === null)).toBe(true);
    expect(started.items.find((item) => item.prompt.id === choice.id)?.prompt.options).toEqual([
      { id: 'a', text: 'A leader' },
      { id: 'b', text: 'A quorum' },
    ]);

    const right = await answer(started.id, {
      questionId: choice.id,
      response: { kind: 'mcq', choice: 'a' },
      confidence: 3,
      durationMs: 5_000,
    });
    expect(right).toMatchObject({ score: 1, gradedBy: 'auto', confidence: 3 });
    expect(right.question.answer.kind).toBe('mcq');
    await refuse(
      started.id,
      { questionId: choice.id, response: { kind: 'mcq', choice: 'b' } },
      409,
    );
    await refuse(
      started.id,
      { questionId: choice.id, response: { kind: 'short', text: 'x' } },
      409,
    );

    // A short answer that matches no accepted form is not marked wrong: it waits for you.
    const loose = await answer(started.id, {
      questionId: phrase.id,
      response: { kind: 'short', text: 'voting for a leader' },
      assisted: true,
    });
    expect(loose).toMatchObject({ score: null, gradedBy: null, assisted: true });
    const open = await answer(started.id, {
      questionId: essay.id,
      response: { kind: 'explain', text: 'Majorities overlap.' },
    });
    expect(open.score).toBeNull();
    const graded = await api.post(
      `/api/answers/${open.id}/grade`,
      { score: 0.5 },
      200,
      AnswerResultSchema,
    );
    expect(graded).toMatchObject({ score: 0.5, gradedBy: 'self' });
    await api.post(`/api/answers/${open.id}/grade`, { score: 1 }, 409);
    await api.post(`/api/answers/${loose.id}/grade`, { score: 0.7 }, 400);

    const finished = await api.post(
      `/api/attempts/${started.id}/finish`,
      undefined,
      200,
      AttemptSchema,
    );
    // Pending answers do not count until graded: (1 + 0.5) / 2.
    expect(finished.score).toBeCloseTo(0.75);
    expect(finished.counts).toEqual({ total: 3, answered: 3, correct: 1, pending: 1 });
    await api.post(`/api/answers/${loose.id}/grade`, { score: 1 }, 200);
    expect((await api.get(`/api/attempts/${started.id}`, AttemptSchema)).score).toBeCloseTo(
      2.5 / 3,
    );
    await refuse(
      started.id,
      { questionId: essay.id, response: { kind: 'explain', text: 'x' } },
      409,
    );

    // Retake the ones not fully right.
    const retake = await api.post(
      `/api/attempts/${started.id}/retake`,
      undefined,
      201,
      QuizSummarySchema,
    );
    expect(retake).toMatchObject({ title: 'Retake — Practice quiz', questionCount: 1 });
  });

  it('keeps answers append-only in the database', async () => {
    const { raft, mcq, quiz, attempt, answer, bed: testbed } = await setUp();
    const choice = await mcq([raft.id]);
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    const given = await answer(started.id, {
      questionId: choice.id,
      response: { kind: 'mcq', choice: 'b' },
    });
    const { db } = testbed.ctx;
    expect(() => db.run('UPDATE answers SET score = 1 WHERE id = ?', [given.id])).toThrow(
      /append-only/,
    );
    expect(() => db.run('DELETE FROM answers WHERE id = ?', [given.id])).toThrow(/append-only/);
  });
});

describe('mock exams', () => {
  it('hide answers until submitted, keep a draft, and count blanks as wrong', async () => {
    const { api, clock, module, raft, mcq, short, explain, quiz, attempt, refuse } = await setUp();
    const choice = await mcq([raft.id]);
    const phrase = await short([raft.id]);
    const essay = await explain([raft.id]);
    const mock = await quiz({
      kind: 'mock_exam',
      config: { scope: { moduleId: module.id }, timeLimitMinutes: 30 },
    });
    const started = await attempt(mock.id);
    expect(started.deadline).toBe(new Date(clock.now().getTime() + 30 * 60_000).toISOString());
    await refuse(
      started.id,
      { questionId: choice.id, response: { kind: 'mcq', choice: 'a' } },
      400,
    );

    const responses = {
      [choice.id]: { kind: 'mcq', choice: 'a' },
      [essay.id]: { kind: 'explain', text: 'They overlap.' },
    };
    await api.put(`/api/attempts/${started.id}/draft`, { responses });
    const saved = await api.get(`/api/attempts/${started.id}`, AttemptSchema);
    expect(Object.keys(saved.draft)).toHaveLength(2);
    expect(saved.items.every((item) => item.answer === null)).toBe(true);

    clock.advance(20 * 60_000);
    const submitted = await api.post(
      `/api/attempts/${started.id}/submit`,
      { responses },
      200,
      AttemptSchema,
    );
    expect(submitted.finishedAt).not.toBeNull();
    expect(submitted.draft).toEqual({});
    const byId = new Map(submitted.items.map((item) => [item.prompt.id, item.answer]));
    expect(byId.get(choice.id)).toMatchObject({ score: 1 });
    expect(byId.get(phrase.id)).toMatchObject({ response: null, score: 0 });
    expect(byId.get(essay.id)).toMatchObject({ score: null });
    expect(submitted.score).toBeCloseTo(0.5);
    await api.post(`/api/attempts/${started.id}/submit`, { responses }, 409);
  });
});
