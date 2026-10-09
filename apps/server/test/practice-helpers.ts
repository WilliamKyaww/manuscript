import {
  AnswerResultSchema,
  AttemptSchema,
  ConceptSummarySchema,
  ModuleSummarySchema,
  type QuestionInput,
  QuestionSchema,
  QuizSummarySchema,
} from '@skb/core';
import type { FixedClock } from '../src/shared/clock';
import { jsonApi } from './api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from './sources-helpers';

/**
 * A running test server with a module, two concepts and helpers for questions, quizzes and
 * answers (Phase 9 tests).
 */
export async function practiceTestbed() {
  const bed: SourcesTestbed = createSourcesTestbed();
  await bed.start();
  const api = jsonApi(bed.request);
  const clock = bed.ctx.clock as FixedClock;
  const module = await api.post(
    '/api/modules',
    { code: 'COC251', title: 'Distributed Systems', credits: 15 },
    201,
    ModuleSummarySchema,
  );
  const concept = (name: string, extra: Record<string, unknown> = {}) =>
    api.post(
      '/api/concepts',
      { name, moduleIds: [module.id], ...extra },
      201,
      ConceptSummarySchema,
    );
  const raft = await concept('Raft');
  const paxos = await concept('Paxos');

  const question = (input: Partial<QuestionInput> & Pick<QuestionInput, 'answer'>) =>
    api.post('/api/questions', { stem: 'A question', ...input }, 201, QuestionSchema);
  const mcq = (conceptIds: string[], extra: Partial<QuestionInput> = {}) =>
    question({
      stem: 'What does Raft elect?',
      answer: {
        kind: 'mcq',
        options: [
          { id: 'a', text: 'A leader', correct: true },
          { id: 'b', text: 'A quorum', correct: false, explanation: 'A quorum votes.' },
        ],
      },
      conceptIds: conceptIds as QuestionInput['conceptIds'],
      ...extra,
    });
  const short = (conceptIds: string[], extra: Partial<QuestionInput> = {}) =>
    question({
      stem: 'Name the phase in which Raft chooses a leader.',
      answer: { kind: 'short', accepted: ['leader election', 'election'] },
      conceptIds: conceptIds as QuestionInput['conceptIds'],
      ...extra,
    });
  const explain = (conceptIds: string[], extra: Partial<QuestionInput> = {}) =>
    question({
      stem: 'Explain why Raft needs a majority.',
      answer: { kind: 'explain', model: 'Two majorities always overlap.' },
      rubric: '- overlap of majorities',
      conceptIds: conceptIds as QuestionInput['conceptIds'],
      ...extra,
    });

  const quiz = (body: Record<string, unknown>) =>
    api.post('/api/quizzes', body, 201, QuizSummarySchema);
  const attempt = (quizId: string) =>
    api.post(`/api/quizzes/${quizId}/attempts`, undefined, 201, AttemptSchema);
  const answer = (attemptId: string, body: Record<string, unknown>) =>
    api.post(`/api/attempts/${attemptId}/answers`, body, 201, AnswerResultSchema);
  /** An answer the server must refuse with `status`. */
  const refuse = (attemptId: string, body: Record<string, unknown>, status: number) =>
    api.post(`/api/attempts/${attemptId}/answers`, body, status);

  return {
    bed,
    api,
    clock,
    module,
    raft,
    paxos,
    concept,
    question,
    mcq,
    short,
    explain,
    quiz,
    attempt,
    answer,
    refuse,
  };
}
