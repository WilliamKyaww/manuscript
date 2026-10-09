import { AttemptSchema, LearnStateSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

async function setUp() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  return testbed;
}

describe('Learn sessions', () => {
  it('climbs the ladder until every concept is secure', async () => {
    const { api, module, raft, paxos, mcq, short, explain, answer, refuse } = await setUp();
    const choice = await mcq([raft.id]);
    const phrase = await short([raft.id]);
    const essay = await explain([raft.id]);
    const learn = (id: string) => api.get(`/api/learn/${id}`, LearnStateSchema);

    let state = await api.post(
      '/api/learn',
      { scope: { moduleId: module.id } },
      201,
      LearnStateSchema,
    );
    expect(state.title).toBe('Learn — COC251');
    expect(state.withoutMaterial).toEqual([{ id: paxos.id, name: 'Paxos' }]);
    expect(state.current).toMatchObject({
      prompt: { id: choice.id },
      concept: { id: raft.id },
      level: 'recognition',
    });

    // Only the question the session is asking can be answered.
    await refuse(
      state.attemptId,
      { questionId: phrase.id, response: { kind: 'short', text: 'election' }, conceptId: raft.id },
      409,
    );
    await answer(state.attemptId, {
      questionId: choice.id,
      response: { kind: 'mcq', choice: 'a' },
      conceptId: raft.id,
    });
    state = await learn(state.attemptId);
    expect(state.last).toMatchObject({ score: 1 });
    expect(state.current).toMatchObject({ prompt: { id: phrase.id }, level: 'recall' });
    await answer(state.attemptId, {
      questionId: phrase.id,
      response: { kind: 'short', text: 'Leader election.' },
      conceptId: raft.id,
    });
    state = await learn(state.attemptId);
    expect(state.current).toMatchObject({ prompt: { id: essay.id }, level: 'production' });

    // An open answer holds the session until it is graded.
    const open = await answer(state.attemptId, {
      questionId: essay.id,
      response: { kind: 'explain', text: 'Majorities overlap.' },
      conceptId: raft.id,
    });
    state = await learn(state.attemptId);
    expect(state.current).toBeNull();
    expect(state.done).toBeNull();
    expect(state.last).toMatchObject({ id: open.id, score: null });
    await api.post(`/api/answers/${open.id}/grade`, { score: 1 }, 200);
    state = await learn(state.attemptId);
    expect(state.done).toBe('secure');
    expect(state.concepts).toEqual([
      {
        concept: { id: raft.id, name: 'Raft' },
        level: 'production',
        shown: 3,
        correct: 3,
        secure: true,
      },
    ]);
    const finished = await api.post(
      `/api/attempts/${state.attemptId}/finish`,
      undefined,
      200,
      AttemptSchema,
    );
    expect(finished.score).toBe(1);
    expect(finished.items).toHaveLength(3);
  });

  it('refuses scopes with nothing to practise and stops at the time limit', async () => {
    const { api, clock, raft, paxos, mcq, refuse } = await setUp();
    await api.post('/api/learn', { scope: { conceptIds: [paxos.id] } }, 400);
    const choice = await mcq([raft.id]);
    const state = await api.post(
      '/api/learn',
      { scope: { conceptIds: [raft.id] }, timeLimitMinutes: 5 },
      201,
      LearnStateSchema,
    );
    expect(state.title).toBe('Learn — Raft');
    clock.advance(7 * 60_000);
    expect((await api.get(`/api/learn/${state.attemptId}`, LearnStateSchema)).done).toBe('time');
    await refuse(
      state.attemptId,
      { questionId: choice.id, response: { kind: 'mcq', choice: 'a' }, conceptId: raft.id },
      409,
    );
  });
});
