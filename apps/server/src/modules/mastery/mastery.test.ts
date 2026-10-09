import {
  CardSchema,
  CardSetSchema,
  ConceptMasteryDetailSchema,
  ProgressOverviewSchema,
  TopicSchema,
  WeakAreasSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

async function setUp() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  return testbed;
}

const DAY = 86_400_000;

describe('mastery', () => {
  it('follows answers and reviews, and its numbers can be checked by hand', async () => {
    const { api, clock, raft, mcq, quiz, attempt, answer } = await setUp();
    const detail = () => api.get(`/api/mastery/concepts/${raft.id}`, ConceptMasteryDetailSchema);
    expect((await detail()).components).toMatchObject({
      mastery: null,
      stage: 'new',
      itemsLinked: 0,
    });

    const first = await mcq([raft.id]);
    const second = await mcq([raft.id], { stem: 'Who keeps the log?' });
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    await answer(started.id, { questionId: first.id, response: { kind: 'mcq', choice: 'a' } });
    clock.advance(21 * DAY);
    await answer(started.id, {
      questionId: second.id,
      response: { kind: 'mcq', choice: 'b' },
    });
    let now = await detail();
    // Accuracy: (1 × 0.5 + 0 × 1) / 1.5 — the first answer is 21 days old, so it weighs half.
    expect(now.components.accuracy).toBeCloseTo(1 / 3);
    expect(now.components.answerWeight).toBeCloseTo(1.5);
    expect(now.components.mastery).toBeCloseTo(1 / 3);
    expect(now.components.evidence).toBeCloseTo(2.25);
    expect(now.components).toMatchObject({
      confidence: 'low',
      stage: 'learning',
      itemsLinked: 2,
      itemsPractised: 2,
      coverage: 1,
    });
    expect(now.answers.map((row) => [row.score, row.weight])).toEqual([
      [0, 1],
      [1, 0.5],
    ]);

    // A reviewed card adds its retrievability now.
    const set = await api.post('/api/card-sets', { title: 'Raft' }, 201, CardSetSchema);
    const card = await api.post(
      '/api/cards',
      {
        setId: set.id,
        kind: 'basic',
        front: 'Raft elects?',
        back: 'A leader',
        conceptIds: [raft.id],
      },
      201,
      CardSchema,
    );
    await api.post(
      '/api/reviews',
      { cardId: card.id, ordinal: 0, rating: 4, durationMs: 3_000 },
      201,
    );
    now = await detail();
    expect(now.components.recallCount).toBe(1);
    expect(now.components.recall).toBeCloseTo(1, 2);
    const { recall, accuracy, answerWeight } = now.components;
    expect(now.components.mastery).toBeCloseTo(
      ((recall ?? 0) * 1 + 1.5 * (accuracy ?? 0) * answerWeight) / (1 + 1.5 * answerWeight),
    );
    expect(now.cards).toEqual({ linked: 1, reviewed: 1 });
  });

  it('rolls up by topic and module, separating mastery from readiness', async () => {
    const { api, module, raft, paxos, concept, mcq, quiz, attempt, answer } = await setUp();
    const topic = await api.post(
      `/api/modules/${module.id}/topics`,
      { title: 'Consensus' },
      201,
      TopicSchema,
    );
    await api.patch(`/api/concepts/${raft.id}`, { topicIds: [topic.id], importance: 2 }, 200);
    await concept('Gossip');
    const question = await mcq([raft.id]);
    const other = await mcq([paxos.id]);
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'a' } });
    await answer(started.id, { questionId: other.id, response: { kind: 'mcq', choice: 'b' } });

    const overview = await api.get('/api/progress', ProgressOverviewSchema);
    const coc = overview.modules[0];
    expect(coc?.module.code).toBe('COC251');
    // Raft 1 (importance 2), Paxos 0, Gossip unstarted.
    expect(coc?.rollUp).toMatchObject({ practised: 2, total: 3 });
    expect(coc?.rollUp.mastery).toBeCloseTo(2 / 3);
    expect(coc?.rollUp.readiness).toBeCloseTo(2 / 4);
    expect(coc?.rollUp.coverage).toBeCloseTo(2 / 3);
    expect(coc?.topics[0]?.rollUp).toMatchObject({ mastery: 1, readiness: 1, total: 1 });
    expect(coc?.concepts.map((row) => row.concept.name)).toEqual(['Gossip', 'Paxos', 'Raft']);
    expect(overview.overall.total).toBe(3);

    // The cache holds what was computed.
    const cached = bed?.ctx.db.all<{ entity_type: string; n: number }>(
      'SELECT entity_type, count(*) AS n FROM mastery_cache GROUP BY entity_type ORDER BY entity_type',
    );
    expect(cached?.map((row) => [row.entity_type, Number(row.n)])).toEqual([
      ['concept', 3],
      ['course', 1],
      ['module', 1],
      ['topic', 1],
    ]);
  });

  it('lists weak areas by priority, with reasons, and concepts with nothing to practise', async () => {
    const { api, module, raft, paxos, mcq, quiz, attempt, answer } = await setUp();
    await api.post(
      `/api/modules/${module.id}/assessments`,
      { title: 'Exam', kind: 'exam', weight: 1, dueAt: '2026-10-11' },
      201,
    );
    const questions = await Promise.all(
      Array.from({ length: 3 }, (_, index) => mcq([raft.id], { stem: `Raft ${index}` })),
    );
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    for (const question of questions)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'b' } });

    const weak = await api.get('/api/mastery/weak', WeakAreasSchema);
    expect(weak.items.map((row) => row.concept.name)).toEqual(['Raft']);
    const raftRow = weak.items[0];
    expect(raftRow?.signals).toEqual([
      { kind: 'weak', reason: 'Mastery 0.00 with medium confidence.' },
    ]);
    // Gap 1 × whole module (one module) × urgency 14 / 7 days × importance 1.
    expect(raftRow?.exposure).toMatchObject({ assessment: { title: 'Exam', daysUntil: 7 } });
    expect(raftRow?.priority).toBeCloseTo(2);
    expect(weak.noMaterial).toEqual([{ id: paxos.id, name: 'Paxos' }]);
  });
});
