import {
  type AnswerResult,
  type IdFactory,
  type Question,
  type QuestionPrompt,
  type QuestionResponse,
  ValidationError,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { AttemptsService } from '../practice/attempts';
import type { AttemptsRepository, QuizRow } from '../practice/attempts-repository';
import { promptOf, type QuestionsService } from '../practice/questions';
import type { TutorRepository } from './repository';

/**
 * Tutoring (tasks 14.02, learning-system.md §6): the "quiz me" flow. The tutor picks questions from
 * the student's own bank — the prompt only, never the answer key — and, once the student has
 * replied, records their answer as evidence, flagged as assisted. A tutored chat keeps its answers
 * in a practice quiz and attempt of its own, so they count towards mastery like any other answer
 * (less, because they are assisted) and can be found again from the conversation.
 */

export interface TutorDependencies {
  repo: TutorRepository;
  attemptsRepo: AttemptsRepository;
  attempts: AttemptsService;
  questions: QuestionsService;
  clock: Clock;
  ids: IdFactory;
}

export type TutorService = ReturnType<typeof createTutorService>;

export interface QuestionSearch {
  conceptId?: string | undefined;
  moduleId?: string | undefined;
  lectureId?: string | undefined;
  /** Words that must appear in the question or the name of a concept it tests. */
  query?: string | undefined;
  limit: number;
}

export interface RecordedAnswer {
  answerId: string;
  questionId: string;
  /** 0–1, or null while the student still has to grade an open answer against the model answer. */
  score: number | null;
  correct: boolean | null;
  assisted: boolean;
  feedback: string;
  explanation: string;
  /** What the right answer was, revealed now that the student has answered. */
  correctAnswer: string;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);

/** The right answer in a sentence, for the tutor to talk about once the student has replied. */
export function describeKey(question: Question): string {
  const { answer } = question;
  switch (answer.kind) {
    case 'mcq':
    case 'multi':
      return answer.options
        .filter((option) => option.correct)
        .map((option) => option.text)
        .join('; ');
    case 'true_false':
      return answer.value ? 'True' : 'False';
    case 'numeric':
      return `${answer.value}${answer.unit ? ` ${answer.unit}` : ''}`;
    case 'short':
      return answer.accepted[0] ?? '';
    default:
      return answer.model;
  }
}

export function createTutorService(deps: TutorDependencies) {
  const { repo, attemptsRepo, attempts, questions, clock, ids } = deps;

  /** The thread's quiz and attempt, made on the first recorded answer. */
  function sessionFor(threadId: string) {
    const existing = repo.session(threadId);
    if (existing) return existing;
    const title = repo.threadTitle(threadId);
    if (title === null)
      throw new ValidationError('Answers are recorded only inside a tutored conversation.');
    const quiz: QuizRow = {
      id: ids('quiz'),
      title: `Tutor — ${title}`,
      kind: 'practice',
      config: { scope: {}, count: 1, tutor: { threadId } },
      moduleId: null,
      assessmentId: null,
      createdAt: clock.now().toISOString(),
    };
    return repo.transaction(() => {
      attemptsRepo.insertQuiz(quiz, []);
      const attempt = attempts.startAdaptive(quiz, undefined);
      const row = {
        threadId,
        quizId: quiz.id,
        attemptId: attempt.id,
        createdAt: clock.now().toISOString(),
      };
      repo.insertSession(row);
      return row;
    });
  }

  return {
    /** Questions from the bank to put to the student: prompts only, nothing that gives the answer away. */
    questionsFor(search: QuestionSearch, threadId: string | null): QuestionPrompt[] {
      const session = threadId ? repo.session(threadId) : null;
      const asked = session ? repo.answeredIn(repo.attemptsOf(session.quizId)) : new Set<string>();
      const needles = words(search.query ?? '');
      return questions
        .list({
          status: 'active',
          ...(search.conceptId ? { conceptId: search.conceptId } : {}),
          ...(search.moduleId ? { moduleId: search.moduleId } : {}),
          ...(search.lectureId ? { lectureId: search.lectureId } : {}),
        })
        .filter((question) => !asked.has(question.id))
        .filter((question) => {
          if (needles.length === 0) return true;
          const haystack = words(
            `${question.stem} ${question.concepts.map((concept) => concept.name).join(' ')}`,
          );
          return needles.some((needle) =>
            haystack.some((word) => word === needle || word.startsWith(needle)),
          );
        })
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, search.limit)
        .map(promptOf);
    },

    /** Records what the student answered, as assisted evidence, and reveals the answer. */
    recordAnswer(
      threadId: string,
      input: { questionId: string; response: QuestionResponse; confidence?: number | undefined },
    ): RecordedAnswer {
      const session = sessionFor(threadId);
      const question = questions.get(input.questionId);
      let attemptId = session.attemptId;
      const answered = repo.answeredIn([attemptId]);
      if (answered.has(question.id)) {
        // Asked again later in the conversation: a new attempt, the earlier answer stays as it was.
        const quiz = attemptsRepo.quiz(session.quizId) as QuizRow;
        attemptId = attempts.startAdaptive(quiz, undefined).id;
        repo.setAttempt(threadId, attemptId);
      }
      if (!attemptsRepo.items(session.quizId).includes(question.id))
        attemptsRepo.addItem(session.quizId, question.id);
      const result: AnswerResult = attempts.answer(attemptId, {
        questionId: question.id,
        response: input.response,
        assisted: true,
        ...(input.confidence ? { confidence: input.confidence } : {}),
      });
      return {
        answerId: result.id,
        questionId: question.id,
        score: result.score,
        correct: result.score === null ? null : result.score >= 0.99,
        assisted: true,
        feedback: result.feedback,
        explanation: question.explanation,
        correctAnswer: describeKey(question),
      };
    },
  };
}
