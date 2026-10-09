import {
  answerEndpoint,
  conceptMasteryEndpoint,
  createQuestionEndpoint,
  createQuizEndpoint,
  deleteQuestionEndpoint,
  deleteQuizEndpoint,
  exportQuizEndpoint,
  finishAttemptEndpoint,
  getAttemptEndpoint,
  getLearnEndpoint,
  getQuestionEndpoint,
  getQuizEndpoint,
  gradeAnswerEndpoint,
  listQuestionsEndpoint,
  listQuizzesEndpoint,
  previewQuizEndpoint,
  progressEndpoint,
  retakeAttemptEndpoint,
  saveDraftEndpoint,
  startAttemptEndpoint,
  startLearnEndpoint,
  submitAttemptEndpoint,
  updateQuestionEndpoint,
  weakAreasEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { MasteryService } from '../mastery/service';
import type { AttemptsService } from './attempts';
import type { LearnService } from './learn';
import type { QuestionsService } from './questions';
import type { QuizzesService } from './quizzes';

const ok = { ok: true as const };

export interface PracticeServices {
  questions: QuestionsService;
  quizzes: QuizzesService;
  attempts: AttemptsService;
  learn: LearnService;
  mastery: MasteryService;
}

export function registerPracticeRoutes(registry: ApiRegistry, services: PracticeServices): void {
  const { questions, quizzes, attempts, learn, mastery } = services;

  registerEndpoint(registry, listQuestionsEndpoint, ({ query }) => ({
    questions: questions.list({
      moduleId: query.module,
      lectureId: query.lecture,
      conceptId: query.concept,
      kind: query.kind,
      status: query.status,
      q: query.q,
    }),
  }));
  registerEndpoint(registry, createQuestionEndpoint, ({ body }) => questions.create(body));
  registerEndpoint(registry, getQuestionEndpoint, ({ params }) => questions.get(params.id));
  registerEndpoint(registry, updateQuestionEndpoint, ({ params, body }) =>
    questions.update(params.id, body),
  );
  registerEndpoint(registry, deleteQuestionEndpoint, ({ params }) => {
    questions.remove(params.id);
    return ok;
  });

  registerEndpoint(registry, listQuizzesEndpoint, () => ({ quizzes: quizzes.list() }));
  registerEndpoint(registry, previewQuizEndpoint, ({ body }) => ({
    available: quizzes.preview(body.config),
  }));
  registerEndpoint(registry, createQuizEndpoint, ({ body }) => quizzes.create(body));
  registerEndpoint(registry, getQuizEndpoint, ({ params }) => quizzes.get(params.id));
  registerEndpoint(registry, deleteQuizEndpoint, ({ params }) => {
    quizzes.remove(params.id);
    return ok;
  });
  registerEndpoint(registry, exportQuizEndpoint, ({ params }) => quizzes.exportMarkdown(params.id));

  registerEndpoint(registry, startAttemptEndpoint, ({ params }) => attempts.start(params.id));
  registerEndpoint(registry, getAttemptEndpoint, ({ params }) => attempts.get(params.id));
  registerEndpoint(registry, answerEndpoint, ({ params, body }) =>
    attempts.answer(params.id, body),
  );
  registerEndpoint(registry, saveDraftEndpoint, ({ params, body }) => {
    attempts.saveDraft(params.id, body.responses);
    return ok;
  });
  registerEndpoint(registry, submitAttemptEndpoint, ({ params, body }) =>
    attempts.submit(params.id, body.responses),
  );
  registerEndpoint(registry, finishAttemptEndpoint, ({ params }) => attempts.finish(params.id));
  registerEndpoint(registry, retakeAttemptEndpoint, ({ params }) => attempts.retake(params.id));
  registerEndpoint(registry, gradeAnswerEndpoint, ({ params, body }) =>
    attempts.grade(params.id, body.score),
  );

  registerEndpoint(registry, startLearnEndpoint, ({ body }) =>
    learn.start(body.scope, body.timeLimitMinutes),
  );
  registerEndpoint(registry, getLearnEndpoint, ({ params }) => learn.state(params.id));

  registerEndpoint(registry, progressEndpoint, ({ query }) => mastery.overview(query.module));
  registerEndpoint(registry, conceptMasteryEndpoint, ({ params }) => mastery.concept(params.id));
  registerEndpoint(registry, weakAreasEndpoint, ({ query }) =>
    mastery.weak(query.module, query.limit),
  );
}
