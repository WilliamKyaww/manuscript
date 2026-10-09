import {
  type AnswerInputSchema,
  type AnswerResult,
  type Attempt,
  ConflictError,
  gradeResponse,
  type IdFactory,
  NotFoundError,
  PRACTICE,
  type Question,
  type QuestionResponse,
  type QuizSummary,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { AnswerRow, AttemptRow, AttemptsRepository, QuizRow } from './attempts-repository';
import { learnSession } from './learn-engine';
import { promptOf, type QuestionsService } from './questions';
import type { QuestionsRepository } from './questions-repository';
import type { QuizzesService } from './quizzes';

/**
 * Attempts (task 9.05). A practice quiz answers one question at a time with feedback; a mock exam
 * keeps a draft and is graded when submitted; a Learn session asks what its engine chooses. Every
 * answer is evidence: written once, and a pending answer (graded by the student against the model
 * answer) is given its score once.
 */

type AnswerInput = z.output<typeof AnswerInputSchema>;

export interface AttemptsDependencies {
  repo: AttemptsRepository;
  questionsRepo: QuestionsRepository;
  questions: QuestionsService;
  quizzes: QuizzesService;
  clock: Clock;
  ids: IdFactory;
}

export type AttemptsService = ReturnType<typeof createAttemptsService>;

/** A grace period after a deadline, for answers already on their way. */
const GRACE_MS = 60_000;

export function createAttemptsService(deps: AttemptsDependencies) {
  const { repo, questionsRepo, questions, quizzes, clock, ids } = deps;
  const now = () => clock.now().toISOString();

  const requireAttempt = (id: string): AttemptRow => {
    const row = repo.attempt(id);
    if (!row) throw new NotFoundError('That attempt does not exist.');
    return row;
  };
  const quizOf = (attempt: AttemptRow): QuizRow => {
    const quiz = repo.quiz(attempt.quizId, true);
    if (!quiz) throw new NotFoundError('That quiz does not exist.');
    return quiz;
  };
  const questionMap = (questionIds: readonly string[]): Map<string, Question> => {
    const rows = [...questionsRepo.byIds(questionIds).values()];
    return new Map(questions.questionsOf(rows).map((question) => [question.id, question]));
  };

  const resultOf = (answer: AnswerRow, question: Question): AnswerResult => ({
    id: answer.id as AnswerResult['id'],
    questionId: answer.questionId as AnswerResult['questionId'],
    response: answer.response,
    score: answer.score,
    gradedBy: answer.gradedBy,
    confidence: answer.confidence,
    assisted: answer.assisted,
    answeredAt: answer.answeredAt,
    question,
  });

  const scoreOf = (answers: readonly AnswerRow[]) => {
    const scored = answers.flatMap((answer) => (answer.score === null ? [] : [answer.score]));
    return scored.length === 0 ? null : scored.reduce((a, b) => a + b, 0) / scored.length;
  };

  const view = (attempt: AttemptRow): Attempt => {
    const quiz = quizOf(attempt);
    const answers = repo.answersOf([attempt.id]);
    const order =
      quiz.kind === 'adaptive' ? answers.map((answer) => answer.questionId) : repo.items(quiz.id);
    const byId = questionMap(order);
    const answerOf = new Map(answers.map((answer) => [answer.questionId, answer]));
    const reveal = quiz.kind !== 'mock_exam' || attempt.finishedAt !== null;
    const items = order.flatMap((questionId, ordinal) => {
      const question = byId.get(questionId);
      if (!question) return [];
      const answer = quiz.kind === 'adaptive' ? answers[ordinal] : answerOf.get(questionId);
      return [
        {
          ordinal,
          prompt: promptOf(question),
          answer: reveal && answer ? resultOf(answer, question) : null,
        },
      ];
    });
    return {
      id: attempt.id as Attempt['id'],
      quiz: {
        id: quiz.id as Attempt['quiz']['id'],
        title: quiz.title,
        kind: quiz.kind,
        timeLimitMinutes: quiz.config.timeLimitMinutes ?? null,
      },
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      finishedAt: attempt.finishedAt,
      score: attempt.score,
      items,
      draft: attempt.finishedAt ? {} : attempt.draft,
      counts: {
        total: items.length,
        answered: answers.filter((answer) => answer.response !== null).length,
        correct: answers.filter((answer) => (answer.score ?? 0) >= PRACTICE.correctAt).length,
        pending: answers.filter((answer) => answer.score === null).length,
      },
    };
  };

  const requireOpen = (attempt: AttemptRow) => {
    if (attempt.finishedAt) throw new ConflictError('This attempt has finished.');
  };
  const timeUp = (attempt: AttemptRow, graceMs = 0) =>
    attempt.deadline !== null && clock.now().getTime() > Date.parse(attempt.deadline) + graceMs;

  const close = (attempt: AttemptRow) => {
    const at = now();
    const answers = repo.answersOf([attempt.id]);
    const score = scoreOf(answers);
    repo.transaction(() => {
      repo.finishAttempt(attempt.id, at);
      repo.setScore(attempt.id, score);
      if (attempt.sessionId)
        repo.endSession(attempt.sessionId, at, {
          answered: answers.filter((answer) => answer.response !== null).length,
          correct: answers.filter((answer) => (answer.score ?? 0) >= PRACTICE.correctAt).length,
          score,
        });
    });
  };

  const insert = (
    attempt: AttemptRow,
    question: Question,
    response: QuestionResponse | null,
    extra: Partial<Pick<AnswerRow, 'confidence' | 'assisted' | 'durationMs' | 'conceptId'>>,
  ): AnswerRow => {
    if (response && response.kind !== question.kind)
      throw new ValidationError('The response is for another kind of question.');
    const score = response === null ? 0 : gradeResponse(question.answer, response).score;
    const at = now();
    const row: AnswerRow = {
      id: ids('answer'),
      attemptId: attempt.id,
      questionId: question.id,
      conceptId: extra.conceptId ?? null,
      response,
      score,
      gradedBy: score === null ? null : 'auto',
      gradedAt: score === null ? null : at,
      confidence: extra.confidence ?? null,
      assisted: extra.assisted ?? false,
      durationMs: extra.durationMs ?? null,
      answeredAt: at,
    };
    repo.insertAnswer(row);
    return row;
  };

  return {
    view,

    start(quizId: string): Attempt {
      const quiz = repo.quiz(quizId);
      if (!quiz) throw new NotFoundError('That quiz does not exist.');
      if (quiz.kind === 'adaptive') throw new ValidationError('Start Learn sessions from Learn.');
      const at = clock.now();
      const limit = quiz.config.timeLimitMinutes;
      const row: AttemptRow = {
        id: ids('attempt'),
        quizId,
        startedAt: at.toISOString(),
        deadline: limit ? new Date(at.getTime() + limit * 60_000).toISOString() : null,
        finishedAt: null,
        score: null,
        draft: {},
        sessionId: ids('session'),
      };
      repo.transaction(() => {
        repo.insertSession({
          id: row.sessionId as string,
          kind: 'quiz',
          moduleId: quiz.moduleId,
          startedAt: row.startedAt,
        });
        repo.insertAttempt(row);
      });
      return view(row);
    },

    /** Starts the attempt behind a Learn session (the Learn service builds its quiz). */
    startAdaptive(quiz: QuizRow, timeLimitMinutes: number | undefined): AttemptRow {
      const at = clock.now();
      const row: AttemptRow = {
        id: ids('attempt'),
        quizId: quiz.id,
        startedAt: at.toISOString(),
        deadline: timeLimitMinutes
          ? new Date(at.getTime() + timeLimitMinutes * 60_000).toISOString()
          : null,
        finishedAt: null,
        score: null,
        draft: {},
        sessionId: ids('session'),
      };
      repo.transaction(() => {
        repo.insertSession({
          id: row.sessionId as string,
          kind: 'practice',
          moduleId: quiz.moduleId,
          startedAt: row.startedAt,
        });
        repo.insertAttempt(row);
      });
      return row;
    },

    get: (id: string): Attempt => view(requireAttempt(id)),

    answer(attemptId: string, input: AnswerInput): AnswerResult {
      const attempt = requireAttempt(attemptId);
      requireOpen(attempt);
      if (timeUp(attempt, GRACE_MS)) throw new ConflictError('Time is up for this attempt.');
      const quiz = quizOf(attempt);
      if (quiz.kind === 'mock_exam')
        throw new ValidationError('A mock exam is answered all at once, when you submit it.');
      const answers = repo.answersOf([attempt.id]);
      if (quiz.kind === 'practice') {
        if (!repo.items(quiz.id).includes(input.questionId))
          throw new ValidationError('That question is not part of this quiz.');
        if (answers.some((answer) => answer.questionId === input.questionId))
          throw new ConflictError('That question has been answered in this attempt.');
      } else {
        if (answers.some((answer) => answer.score === null))
          throw new ConflictError('Grade your last answer first.');
        const next = learnSession(quiz, repo.items(quiz.id), questionsRepo, answers).next;
        if (!next || next.itemId !== input.questionId || next.conceptId !== input.conceptId)
          throw new ConflictError('That is not the question this session is asking now.');
      }
      const question = questionMap([input.questionId]).get(input.questionId);
      if (!question) throw new NotFoundError('That question does not exist.');
      const row = insert(attempt, question, input.response, {
        confidence: input.confidence ?? null,
        assisted: input.assisted,
        durationMs: input.durationMs ?? null,
        conceptId: quiz.kind === 'adaptive' ? (input.conceptId ?? null) : null,
      });
      return resultOf(row, question);
    },

    saveDraft(attemptId: string, responses: Record<string, QuestionResponse>): void {
      const attempt = requireAttempt(attemptId);
      requireOpen(attempt);
      if (quizOf(attempt).kind !== 'mock_exam')
        throw new ValidationError('Only mock exams keep drafts.');
      repo.saveDraft(attempt.id, responses);
    },

    /** Grades a mock exam: blanks score 0, open answers wait for the student's own grade. */
    submit(attemptId: string, responses: Record<string, QuestionResponse>): Attempt {
      const attempt = requireAttempt(attemptId);
      requireOpen(attempt);
      const quiz = quizOf(attempt);
      if (quiz.kind !== 'mock_exam') throw new ValidationError('Only mock exams are submitted.');
      const order = repo.items(quiz.id);
      const byId = questionMap(order);
      repo.transaction(() => {
        for (const questionId of order) {
          const question = byId.get(questionId);
          if (question) insert(attempt, question, responses[questionId] ?? null, {});
        }
        close(attempt);
      });
      return view(requireAttempt(attemptId));
    },

    finish(attemptId: string): Attempt {
      const attempt = requireAttempt(attemptId);
      requireOpen(attempt);
      if (quizOf(attempt).kind === 'mock_exam')
        throw new ValidationError('Submit the mock exam to finish it.');
      close(attempt);
      return view(requireAttempt(attemptId));
    },

    grade(answerId: string, score: number): AnswerResult {
      const answer = repo.answer(answerId);
      if (!answer) throw new NotFoundError('That answer does not exist.');
      if (answer.score !== null) throw new ConflictError('That answer has already been graded.');
      repo.grade(answerId, score, 'self', now());
      const attempt = requireAttempt(answer.attemptId);
      // A finished attempt's score includes answers graded afterwards.
      if (attempt.finishedAt) repo.setScore(attempt.id, scoreOf(repo.answersOf([attempt.id])));
      const question = questionMap([answer.questionId]).get(answer.questionId) as Question;
      return resultOf(repo.answer(answerId) as AnswerRow, question);
    },

    /** A new practice quiz of the questions not answered fully right. */
    retake(attemptId: string): QuizSummary {
      const attempt = requireAttempt(attemptId);
      const quiz = quizOf(attempt);
      const wrong = [
        ...new Set(
          repo
            .answersOf([attempt.id])
            .filter((answer) => answer.score !== null && answer.score < 1)
            .map((answer) => answer.questionId),
        ),
      ].filter((questionId) => questionsRepo.get(questionId)?.status === 'active');
      if (wrong.length === 0)
        throw new ValidationError('Nothing to retake: every graded answer was right.');
      return quizzes.create(
        {
          title: `Retake — ${quiz.title}`,
          kind: 'practice',
          config: { scope: quiz.config.scope, count: wrong.length },
        },
        wrong,
      );
    },
  };
}
