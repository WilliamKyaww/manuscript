import { QuestionSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

async function setUp() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  return testbed;
}

const List = z.object({ questions: z.array(QuestionSchema) });

describe('the question bank', () => {
  it('creates each kind, validates keys and links concepts and places', async () => {
    const { api, module, raft, mcq, question } = await setUp();
    const created = await mcq([raft.id], { moduleId: module.id, tags: ['raft', 'raft'] });
    expect(created).toMatchObject({
      kind: 'mcq',
      difficulty: 3,
      status: 'active',
      module: { code: 'COC251' },
      tags: ['raft'],
      concepts: [{ id: raft.id, name: 'Raft' }],
      stats: { answers: 0, lastScore: null },
    });
    // Two right answers to a single-choice question, or none in a multi-select, are refused.
    await api.post(
      '/api/questions',
      {
        stem: 'x',
        answer: {
          kind: 'mcq',
          options: [
            { id: 'a', text: 'A', correct: true },
            { id: 'b', text: 'B', correct: true },
          ],
        },
      },
      400,
    );
    await api.post(
      '/api/questions',
      {
        stem: 'x',
        answer: { kind: 'numeric', value: 1, tolerance: { type: 'relative', amount: -1 } },
      },
      400,
    );
    await api.post('/api/questions', { stem: 'x', answer: { kind: 'essay' } }, 400);
    await api.post(
      '/api/questions',
      {
        stem: 'x',
        answer: { kind: 'true_false', value: true },
        conceptIds: ['con_01ARZ3NDEKTSV4RRFFQ69G5FAV'],
      },
      400,
    );
    const numeric = await question({
      stem: 'How many servers tolerate two failures?',
      answer: { kind: 'numeric', value: 5, tolerance: { type: 'absolute', amount: 0 } },
    });
    expect(numeric.answer).toEqual({
      kind: 'numeric',
      value: 5,
      tolerance: { type: 'absolute', amount: 0 },
      unit: '',
    });
  });

  it('changes kind with the key, filters, and deletes softly', async () => {
    const { api, raft, paxos, mcq, short } = await setUp();
    const first = await mcq([raft.id]);
    await short([paxos.id]);
    const changed = await api.patch(
      `/api/questions/${first.id}`,
      { answer: { kind: 'true_false', value: true }, stem: 'Raft elects a leader.' },
      200,
      QuestionSchema,
    );
    expect(changed.kind).toBe('true_false');
    expect((await api.get(`/api/questions?concept=${paxos.id}`, List)).questions).toHaveLength(1);
    expect((await api.get('/api/questions?kind=true_false', List)).questions).toHaveLength(1);
    expect((await api.get('/api/questions?q=elects', List)).questions).toHaveLength(1);
    await api.delete(`/api/questions/${first.id}`);
    await api.get(`/api/questions/${first.id}`, undefined, 404);
    expect((await api.get('/api/questions', List)).questions).toHaveLength(1);
    expect((await api.get('/api/questions?status=deleted', List)).questions).toHaveLength(1);
  });
});
