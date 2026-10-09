import { QuizDetailSchema, QuizSummarySchema, TopicSchema } from '@skb/core';
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

const Preview = z.object({ available: z.number() });

describe('the quiz builder', () => {
  it('selects by scope, kinds, difficulty and tags', async () => {
    const { api, module, raft, paxos, concept, mcq, short, explain, question } = await setUp();
    const topic = await api.post(
      `/api/modules/${module.id}/topics`,
      { title: 'Consensus' },
      201,
      TopicSchema,
    );
    const sub = await api.post(
      `/api/modules/${module.id}/topics`,
      { title: 'Leader election', parentId: topic.id },
      201,
      TopicSchema,
    );
    const elected = await concept('Leader lease', { topicIds: [sub.id] });
    await mcq([raft.id], { difficulty: 2, tags: ['raft'] });
    await short([paxos.id], { difficulty: 4 });
    await explain([elected.id]);
    // In the module by its own place, not by a concept.
    await question({
      stem: 'Loose',
      answer: { kind: 'true_false', value: true },
      moduleId: module.id,
    });
    await question({ stem: 'Elsewhere', answer: { kind: 'true_false', value: false } });

    const available = async (config: Record<string, unknown>) =>
      (await api.post('/api/quizzes/preview', { config }, 200, Preview)).available;
    expect(await available({})).toBe(5);
    expect(await available({ scope: { moduleId: module.id } })).toBe(4);
    // A topic takes in its subtopics' concepts.
    expect(await available({ scope: { topicIds: [topic.id] } })).toBe(1);
    expect(await available({ scope: { conceptIds: [raft.id, paxos.id] } })).toBe(2);
    expect(await available({ scope: { tags: ['raft'] } })).toBe(1);
    expect(await available({ kinds: ['mcq', 'short'] })).toBe(2);
    expect(await available({ difficulty: { min: 3, max: 5 } })).toBe(4);
  });

  it('builds reproducible quizzes, mock exams timed like their assessment, and exports them', async () => {
    const { api, module, raft, mcq, short, explain, quiz } = await setUp();
    await explain([raft.id]);
    await short([raft.id]);
    await mcq([raft.id]);
    await api.post(
      '/api/quizzes',
      { kind: 'practice', config: { scope: { tags: ['none'] } } },
      400,
    );
    const practice = await quiz({ kind: 'practice', config: { count: 2 } });
    expect(practice).toMatchObject({ title: 'Practice quiz', questionCount: 2, attempts: 0 });
    const exam = await api.post(
      `/api/modules/${module.id}/assessments`,
      { title: 'Summer exam', kind: 'exam', weight: 0.7, dueAt: '2026-11-20', durationMinutes: 90 },
      201,
    );
    const mock = await quiz({
      kind: 'mock_exam',
      config: { count: 10, assessmentId: (exam as { id: string }).id },
    });
    expect(mock).toMatchObject({
      title: 'Mock exam — Summer exam',
      questionCount: 3,
      module: { code: 'COC251' },
      config: { timeLimitMinutes: 90, scope: { moduleId: module.id } },
    });
    // A mock exam asks recognition, then recall, then production questions, like a paper.
    const detail = await api.get(`/api/quizzes/${mock.id}`, QuizDetailSchema);
    expect(detail.questions.map((question) => question.kind)).toEqual(['mcq', 'short', 'explain']);
    const exported = await api.get<{ filename: string; content: string }>(
      `/api/quizzes/${mock.id}/export`,
    );
    expect(exported.filename).toBe('Mock exam  Summer exam.md');
    expect(exported.content).toContain('# Mock exam — Summer exam');
    expect(exported.content).toContain('- [x] A leader');
    expect(exported.content).toContain('  - A quorum votes.');
    expect(exported.content).toContain('**Accepted:** leader election; election');
    expect(exported.content).toContain('**Rubric:**');

    const list = await api.get('/api/quizzes', z.object({ quizzes: z.array(QuizSummarySchema) }));
    expect(list.quizzes.map((item) => item.id)).toEqual([mock.id, practice.id]);
    await api.delete(`/api/quizzes/${practice.id}`);
    await api.get(`/api/quizzes/${practice.id}`, undefined, 404);
  });
});
