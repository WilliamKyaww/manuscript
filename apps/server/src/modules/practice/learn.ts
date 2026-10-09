import {
  type Id,
  type IdFactory,
  LADDER,
  type LearnScope,
  type LearnState,
  NotFoundError,
  type QuizConfig,
  ValidationError,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { LearningRepository } from '../learning/repository';
import type { MasteryService } from '../mastery/service';
import type { AttemptsService } from './attempts';
import type { AttemptsRepository, QuizRow } from './attempts-repository';
import { learnSession } from './learn-engine';
import { promptOf, type QuestionsService } from './questions';
import type { QuestionsRepository } from './questions-repository';
import { conceptsInScope } from './scope';

/**
 * Learn sessions (task 9.09): an adaptive quiz whose concepts (with their priority and stage) and
 * questions are fixed when it begins, and whose next question the engine chooses from the answers
 * so far. Answering goes through the attempts service like any other answer.
 */

export interface LearnDependencies {
  repo: AttemptsRepository;
  questionsRepo: QuestionsRepository;
  questions: QuestionsService;
  attempts: AttemptsService;
  mastery: MasteryService;
  learning: LearningRepository;
  clock: Clock;
  ids: IdFactory;
}

export type LearnService = ReturnType<typeof createLearnService>;

export function createLearnService(deps: LearnDependencies) {
  const { repo, questionsRepo, questions, attempts, mastery, learning, clock, ids } = deps;

  const title = (scope: LearnScope, conceptNames: string[]) => {
    if (scope.conceptIds?.length === 1 && conceptNames[0]) return `Learn — ${conceptNames[0]}`;
    if (scope.topicIds?.length === 1) {
      const topic = learning.topic(scope.topicIds[0] as string);
      if (topic) return `Learn — ${topic.title}`;
    }
    const module = scope.moduleId ? learning.module(scope.moduleId) : null;
    return module ? `Learn — ${module.code}` : 'Learn';
  };

  const state = (attemptId: string): LearnState => {
    const attempt = repo.attempt(attemptId);
    const quiz = attempt ? repo.quiz(attempt.quizId, true) : null;
    if (!attempt || !quiz || quiz.kind !== 'adaptive')
      throw new NotFoundError('That Learn session does not exist.');
    const answers = repo.answersOf([attempt.id]);
    const itemIds = repo.items(quiz.id);
    const session = learnSession(quiz, itemIds, questionsRepo, answers);
    const sessionConcepts = quiz.config.learn?.concepts ?? [];
    const names = new Map(
      questionsRepo
        .concepts(sessionConcepts.map((concept) => concept.id))
        .map((concept) => [concept.id, concept.name]),
    );
    const ref = (id: string) => ({
      id: id as Id<'concept'>,
      name: names.get(id) ?? 'Removed concept',
    });

    const last = answers.at(-1);
    const pending = last !== undefined && last.score === null;
    const allSecure = session.next === null;
    const timeUp = attempt.deadline !== null && clock.now() > new Date(attempt.deadline);
    const done = attempt.finishedAt
      ? allSecure
        ? 'secure'
        : 'finished'
      : allSecure && !pending
        ? 'secure'
        : timeUp && !pending
          ? 'time'
          : null;

    let current: LearnState['current'] = null;
    if (!done && !pending && session.next) {
      const row = questionsRepo.byIds([session.next.itemId]).get(session.next.itemId);
      const question = row ? questions.questionsOf([row])[0] : undefined;
      if (question)
        current = {
          prompt: promptOf(question),
          concept: ref(session.next.conceptId),
          level: session.next.level,
        };
    }
    const lastView = last ? (attempts.view(attempt).items.at(-1)?.answer ?? null) : null;

    return {
      attemptId: attempt.id as LearnState['attemptId'],
      title: quiz.title,
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      finishedAt: attempt.finishedAt,
      current,
      last: lastView,
      concepts: sessionConcepts.flatMap((concept) => {
        const progress = session.progress.get(concept.id);
        return progress
          ? [
              {
                concept: ref(concept.id),
                level: LADDER[progress.level] ?? 'recognition',
                shown: progress.shown,
                correct: progress.correct,
                secure: progress.secure,
              },
            ]
          : [];
      }),
      withoutMaterial: sessionConcepts
        .filter((concept) => !session.progress.has(concept.id))
        .map((concept) => ref(concept.id)),
      answered: answers.length,
      done,
    };
  };

  return {
    state,

    start(scope: LearnScope, timeLimitMinutes?: number): LearnState {
      if (scope.moduleId && !learning.module(scope.moduleId))
        throw new ValidationError('That module does not exist.');
      const context = { memberships: questionsRepo.memberships(), topics: questionsRepo.topics() };
      const all = mastery.states();
      const inScope = conceptsInScope(
        scope,
        all.map((concept) => concept.id),
        context,
      );
      if (inScope.length === 0) throw new ValidationError('There are no concepts in this scope.');
      const wanted = new Set(inScope);
      const pool = questionsRepo
        .pool()
        .filter((entry) => entry.conceptIds.some((conceptId) => wanted.has(conceptId)));
      if (pool.length === 0)
        throw new ValidationError(
          'None of these concepts has questions linked yet. Add questions to practise them.',
        );
      const states = all.filter((concept) => wanted.has(concept.id));
      const config: QuizConfig = {
        scope: { ...scope },
        count: pool.length,
        timeLimitMinutes,
        learn: {
          concepts: states.map((concept) => ({
            id: concept.id as Id<'concept'>,
            priority: concept.priority,
            stage: concept.stage,
          })),
        },
      };
      const quiz: QuizRow = {
        id: ids('quiz'),
        title: title(
          scope,
          states.map((concept) => concept.name),
        ),
        kind: 'adaptive',
        config,
        moduleId: scope.moduleId ?? null,
        assessmentId: null,
        createdAt: clock.now().toISOString(),
      };
      repo.transaction(() =>
        repo.insertQuiz(
          quiz,
          pool.map((entry) => entry.row.id),
        ),
      );
      const attempt = attempts.startAdaptive(quiz, timeLimitMinutes);
      return state(attempt.id);
    },
  };
}
