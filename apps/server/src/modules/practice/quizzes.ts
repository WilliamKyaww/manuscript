import {
  type AttemptSummary,
  type Id,
  type IdFactory,
  NotFoundError,
  QUESTION_LEVEL,
  type QuizConfig,
  type QuizDetail,
  type QuizInputSchema,
  type QuizSummary,
  seededShuffle,
  seedOf,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { LearningRepository } from '../learning/repository';
import type { AnswerRow, AttemptRow, AttemptsRepository, QuizRow } from './attempts-repository';
import { quizToMarkdown } from './markdown';
import type { QuestionsService } from './questions';
import type { QuestionsRepository } from './questions-repository';
import { questionsInScope } from './scope';

/**
 * The quiz builder (task 9.04): a practice quiz or mock exam is a fixed list of questions chosen
 * from the bank by scope, kinds and difficulty. The choice is shuffled with a seed taken from the
 * quiz's id, so it is reproducible; a mock exam asks recognition questions first, like a paper.
 */

type QuizInput = z.output<typeof QuizInputSchema>;

export interface QuizzesDependencies {
  questionsRepo: QuestionsRepository;
  repo: AttemptsRepository;
  questions: QuestionsService;
  learning: LearningRepository;
  clock: Clock;
  ids: IdFactory;
}

export type QuizzesService = ReturnType<typeof createQuizzesService>;

const LEVEL_ORDER = { recognition: 0, recall: 1, production: 2 } as const;

export function summariseAttempt(attempt: AttemptRow, answers: readonly AnswerRow[]) {
  const own = answers.filter((answer) => answer.attemptId === attempt.id);
  return {
    id: attempt.id as AttemptSummary['id'],
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    answered: own.filter((answer) => answer.response !== null).length,
    pending: own.filter((answer) => answer.score === null).length,
  };
}

export function createQuizzesService(deps: QuizzesDependencies) {
  const { questionsRepo, repo, questions, learning, clock, ids } = deps;

  const requireQuiz = (id: string): QuizRow => {
    const row = repo.quiz(id);
    if (!row) throw new NotFoundError('That quiz does not exist.');
    return row;
  };

  const context = () => ({
    memberships: questionsRepo.memberships(),
    topics: questionsRepo.topics(),
  });
  const matching = (config: QuizConfig) =>
    questionsInScope(questionsRepo.pool(), config, context());

  const summaries = (rows: readonly QuizRow[]): QuizSummary[] => {
    const counts = repo.itemCounts();
    const attempts = repo.attemptsOf(rows.map((row) => row.id));
    const answers = repo.answersOf(attempts.map((attempt) => attempt.id));
    return rows.map((row) => {
      const own = attempts.filter((attempt) => attempt.quizId === row.id);
      const scores = own.flatMap((attempt) =>
        attempt.finishedAt && attempt.score !== null ? [attempt.score] : [],
      );
      const module = row.moduleId ? learning.module(row.moduleId) : null;
      return {
        id: row.id as QuizSummary['id'],
        title: row.title,
        kind: row.kind,
        config: row.config,
        module: module
          ? { id: module.id as Id<'module'>, code: module.code, title: module.title }
          : null,
        questionCount: counts.get(row.id) ?? 0,
        createdAt: row.createdAt,
        attempts: own.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        lastAttempt: own[0] ? summariseAttempt(own[0], answers) : null,
      };
    });
  };

  const defaultTitle = (kind: QuizRow['kind'], config: QuizConfig) => {
    const assessment = config.assessmentId ? learning.assessment(config.assessmentId) : null;
    const module = config.scope.moduleId ? learning.module(config.scope.moduleId) : null;
    const base = kind === 'mock_exam' ? 'Mock exam' : 'Practice quiz';
    if (assessment) return `${base} — ${assessment.title}`;
    return module ? `${base} — ${module.code}` : base;
  };

  const get = (id: string): QuizDetail => {
    const row = requireQuiz(id);
    const summary = summaries([row])[0] as QuizSummary;
    const byId = questionsRepo.byIds(repo.items(id));
    const rows = repo.items(id).flatMap((questionId) => {
      const question = byId.get(questionId);
      return question ? [question] : [];
    });
    const attempts = repo.attemptsOf([id]);
    const answers = repo.answersOf(attempts.map((attempt) => attempt.id));
    return {
      ...summary,
      questions: questions.questionsOf(rows),
      attemptList: attempts.map((attempt) => summariseAttempt(attempt, answers)),
    };
  };

  return {
    list: (): QuizSummary[] => summaries(repo.quizzes()),

    preview: (config: QuizConfig): number => matching(config).length,

    /** Builds a quiz, or a quiz over the given questions (retaking the ones answered wrongly). */
    create(input: QuizInput, fixedQuestionIds?: readonly string[]): QuizSummary {
      const config: QuizConfig = { ...input.config, scope: { ...input.config.scope } };
      if (config.assessmentId) {
        const assessment = learning.assessment(config.assessmentId);
        if (!assessment) throw new ValidationError('That assessment does not exist.');
        if (!config.scope.moduleId) config.scope.moduleId = assessment.moduleId as Id<'module'>;
        if (input.kind === 'mock_exam')
          config.timeLimitMinutes ??= assessment.durationMinutes ?? undefined;
      }
      if (input.kind !== 'mock_exam') delete config.timeLimitMinutes;
      delete config.learn;
      if (config.scope.moduleId && !learning.module(config.scope.moduleId))
        throw new ValidationError('That module does not exist.');

      const id = ids('quiz');
      let chosen: string[];
      if (fixedQuestionIds) chosen = [...fixedQuestionIds];
      else {
        const pool = matching(config);
        if (pool.length === 0)
          throw new ValidationError('No active questions match this scope yet.');
        let picked = seededShuffle(pool, seedOf(id)).slice(0, config.count);
        if (input.kind === 'mock_exam')
          picked = [...picked].sort(
            (a, b) =>
              LEVEL_ORDER[QUESTION_LEVEL[a.row.kind]] - LEVEL_ORDER[QUESTION_LEVEL[b.row.kind]],
          );
        chosen = picked.map((entry) => entry.row.id);
      }
      config.count = chosen.length;
      const row: QuizRow = {
        id,
        title: input.title?.trim() || defaultTitle(input.kind, config),
        kind: input.kind,
        config,
        moduleId: config.scope.moduleId ?? null,
        assessmentId: config.assessmentId ?? null,
        createdAt: clock.now().toISOString(),
      };
      repo.transaction(() => repo.insertQuiz(row, chosen));
      return summaries([row])[0] as QuizSummary;
    },

    get,

    remove(id: string): void {
      requireQuiz(id);
      repo.deleteQuiz(id, clock.now().toISOString());
    },

    exportMarkdown(id: string): { filename: string; content: string } {
      const quiz = get(id);
      const kind = quiz.kind === 'mock_exam' ? 'Mock exam' : 'Practice quiz';
      const subtitle = `${kind} · ${quiz.questions.length} questions · created ${quiz.createdAt.slice(0, 10)}`;
      const safe = quiz.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'quiz';
      return {
        filename: `${safe}.md`,
        content: quizToMarkdown(quiz.title, subtitle, quiz.questions),
      };
    },
  };
}
