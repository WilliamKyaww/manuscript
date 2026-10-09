import { z } from 'zod';
import { idSchema } from '../ids';
import { LADDER } from '../learning/practice';
import {
  QUESTION_KINDS,
  QuestionAnswerSchema,
  ResponseSchema,
  SELF_SCORES,
} from '../learning/questions';
import { LocatorSchema } from '../sources/types';
import { defineEndpoint } from './contract';
import {
  AssessmentIdSchema,
  ConceptRefSchema,
  LectureIdSchema,
  ModuleIdSchema,
  ModuleRefSchema,
  TopicIdSchema,
} from './course';

/**
 * Questions, quizzes, attempts and Learn sessions (learning-system.md §§4–6, Phase 9). Answers are
 * append-only evidence: a pending answer (one the student grades against the model answer) can be
 * given its score once, and nothing else about an answer ever changes.
 */

export const QuestionIdSchema = idSchema('question');
export const QuizIdSchema = idSchema('quiz');
export const AttemptIdSchema = idSchema('attempt');
export const AnswerIdSchema = idSchema('answer');
export const QuestionKindSchema = z.enum(QUESTION_KINDS);
export const QuestionStatusSchema = z.enum(['draft', 'active', 'suspended', 'deleted']);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;
export const PracticeLevelSchema = z.enum(LADDER);
export const SelfScoreSchema = z.union(SELF_SCORES.map((score) => z.literal(score)));

const LectureRef = z.object({ id: LectureIdSchema, key: z.string(), title: z.string() });
const TEXT = 20_000;

export const QuestionSchema = z.object({
  id: QuestionIdSchema,
  kind: QuestionKindSchema,
  /** The question itself (Markdown with maths). */
  stem: z.string(),
  answer: QuestionAnswerSchema,
  /** Points a good answer makes, for grading yourself (explain, derivation, code). */
  rubric: z.string(),
  /** Why the answer is what it is, shown after answering. */
  explanation: z.string(),
  /** Using the hint marks the answer as assisted (it then counts half towards mastery). */
  hint: z.string(),
  difficulty: z.number().int().min(1).max(5),
  status: QuestionStatusSchema,
  module: ModuleRefSchema.nullable(),
  lecture: LectureRef.nullable(),
  tags: z.array(z.string()),
  locator: LocatorSchema.nullable(),
  concepts: z.array(ConceptRefSchema),
  createdBy: z.enum(['user', 'ai', 'import']),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Scored answers so far and the latest score (null before any). */
  stats: z.object({
    answers: z.number().int(),
    lastScore: z.number().nullable(),
    lastAnsweredAt: z.string().nullable(),
  }),
});
export type Question = z.infer<typeof QuestionSchema>;

const Tag = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^\s#,]+$/u, 'Tags have no spaces, commas or #.');

export const QuestionInputSchema = z.object({
  stem: z.string().trim().min(1).max(TEXT),
  answer: QuestionAnswerSchema,
  rubric: z.string().max(TEXT).optional(),
  explanation: z.string().max(TEXT).optional(),
  hint: z.string().max(2_000).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  status: z.enum(['draft', 'active', 'suspended']).optional(),
  moduleId: ModuleIdSchema.nullish(),
  lectureId: LectureIdSchema.nullish(),
  tags: z.array(Tag).max(20).optional(),
  locator: LocatorSchema.nullish(),
  conceptIds: z.array(idSchema('concept')).max(50).optional(),
});
export type QuestionInput = z.input<typeof QuestionInputSchema>;

/** A question as it is asked: everything but the answer key. */
export const QuestionPromptSchema = z.object({
  id: QuestionIdSchema,
  kind: QuestionKindSchema,
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).nullable(),
  unit: z.string().nullable(),
  language: z.string().nullable(),
  hint: z.string(),
  difficulty: z.number().int(),
  concepts: z.array(ConceptRefSchema),
  locator: LocatorSchema.nullable(),
});
export type QuestionPrompt = z.infer<typeof QuestionPromptSchema>;

// --- Quizzes ------------------------------------------------------------------------------------

export const QuizScopeSchema = z.object({
  moduleId: ModuleIdSchema.optional(),
  lectureIds: z.array(LectureIdSchema).max(200).optional(),
  topicIds: z.array(TopicIdSchema).max(200).optional(),
  conceptIds: z.array(idSchema('concept')).max(500).optional(),
  tags: z.array(Tag).max(20).optional(),
});
export type QuizScope = z.infer<typeof QuizScopeSchema>;

export const QuizConfigSchema = z.object({
  scope: QuizScopeSchema.default({}),
  count: z.number().int().min(1).max(200).default(10),
  /** Kinds to include (all when absent). */
  kinds: z.array(QuestionKindSchema).min(1).optional(),
  difficulty: z
    .object({ min: z.number().int().min(1).max(5), max: z.number().int().min(1).max(5) })
    .optional(),
  /** Mock exams only: minutes allowed (the assessment's duration by default). */
  timeLimitMinutes: z.number().int().min(1).max(600).optional(),
  /** Mock exams only: the assessment the exam rehearses. */
  assessmentId: AssessmentIdSchema.optional(),
});
export type QuizConfig = z.infer<typeof QuizConfigSchema>;

export const QuizKindSchema = z.enum(['practice', 'mock_exam', 'adaptive']);
export type QuizKind = z.infer<typeof QuizKindSchema>;

export const AttemptSummarySchema = z.object({
  id: AttemptIdSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  score: z.number().nullable(),
  answered: z.number().int(),
  pending: z.number().int(),
});
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

export const QuizSummarySchema = z.object({
  id: QuizIdSchema,
  title: z.string(),
  kind: QuizKindSchema,
  config: QuizConfigSchema,
  module: ModuleRefSchema.nullable(),
  questionCount: z.number().int(),
  createdAt: z.string(),
  attempts: z.number().int(),
  bestScore: z.number().nullable(),
  lastAttempt: AttemptSummarySchema.nullable(),
});
export type QuizSummary = z.infer<typeof QuizSummarySchema>;

export const QuizDetailSchema = QuizSummarySchema.extend({
  questions: z.array(QuestionSchema),
  attemptList: z.array(AttemptSummarySchema),
});
export type QuizDetail = z.infer<typeof QuizDetailSchema>;

export const QuizInputSchema = z.object({
  title: z.string().trim().max(200).optional(),
  kind: z.enum(['practice', 'mock_exam']),
  config: QuizConfigSchema,
});
export type QuizInput = z.input<typeof QuizInputSchema>;

// --- Attempts -----------------------------------------------------------------------------------

export const AnswerResultSchema = z.object({
  id: AnswerIdSchema,
  questionId: QuestionIdSchema,
  /** Null when a mock-exam question was left blank. */
  response: ResponseSchema.nullable(),
  /** 0–1; null while waiting for the student's own grade. */
  score: z.number().nullable(),
  gradedBy: z.enum(['auto', 'self', 'ai']).nullable(),
  confidence: z.number().int().min(1).max(3).nullable(),
  assisted: z.boolean(),
  answeredAt: z.string(),
  /** The full question with its key, explanation and rubric — revealed once answered. */
  question: QuestionSchema,
});
export type AnswerResult = z.infer<typeof AnswerResultSchema>;

export const AttemptItemSchema = z.object({
  ordinal: z.number().int(),
  prompt: QuestionPromptSchema,
  answer: AnswerResultSchema.nullable(),
});

export const AttemptSchema = z.object({
  id: AttemptIdSchema,
  quiz: z.object({
    id: QuizIdSchema,
    title: z.string(),
    kind: QuizKindSchema,
    timeLimitMinutes: z.number().int().nullable(),
  }),
  startedAt: z.string(),
  /** When a timed attempt runs out. */
  deadline: z.string().nullable(),
  finishedAt: z.string().nullable(),
  score: z.number().nullable(),
  items: z.array(AttemptItemSchema),
  /** A mock exam's saved, not yet submitted responses, by question id. */
  draft: z.record(z.string(), ResponseSchema),
  counts: z.object({
    total: z.number().int(),
    answered: z.number().int(),
    correct: z.number().int(),
    pending: z.number().int(),
  }),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const AnswerInputSchema = z.object({
  questionId: QuestionIdSchema,
  response: ResponseSchema,
  /** How sure the student was before seeing the answer: 1 guess, 2 unsure, 3 sure. */
  confidence: z.number().int().min(1).max(3).optional(),
  assisted: z.boolean().default(false),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  /** In a Learn session: the concept the question was asked for. */
  conceptId: idSchema('concept').optional(),
});
export type AnswerInput = z.input<typeof AnswerInputSchema>;

const Responses = z.record(QuestionIdSchema, ResponseSchema);

// --- Learn --------------------------------------------------------------------------------------

export const LearnScopeSchema = z.object({
  moduleId: ModuleIdSchema.optional(),
  topicIds: z.array(TopicIdSchema).max(200).optional(),
  conceptIds: z.array(idSchema('concept')).max(500).optional(),
});
export type LearnScope = z.infer<typeof LearnScopeSchema>;

export const LearnStateSchema = z.object({
  attemptId: AttemptIdSchema,
  title: z.string(),
  startedAt: z.string(),
  deadline: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** What to answer now; null when the session is over or an answer awaits its grade. */
  current: z
    .object({
      prompt: QuestionPromptSchema,
      concept: ConceptRefSchema,
      level: PracticeLevelSchema,
    })
    .nullable(),
  /** The last answer, so the result stays on screen; it may be waiting for a self-grade. */
  last: AnswerResultSchema.nullable(),
  concepts: z.array(
    z.object({
      concept: ConceptRefSchema,
      level: PracticeLevelSchema,
      shown: z.number().int(),
      correct: z.number().int(),
      secure: z.boolean(),
    }),
  ),
  /** Concepts in scope without questions linked, so they cannot be practised here. */
  withoutMaterial: z.array(ConceptRefSchema),
  answered: z.number().int(),
  /** Why the session stopped: every concept secure, time up, or ended by the student. */
  done: z.enum(['secure', 'time', 'finished']).nullable(),
});
export type LearnState = z.infer<typeof LearnStateSchema>;

// --- Endpoints ----------------------------------------------------------------------------------

const QuestionParams = z.object({ id: QuestionIdSchema });
const QuizParams = z.object({ id: QuizIdSchema });
const AttemptParams = z.object({ id: AttemptIdSchema });
const AnswerParams = z.object({ id: AnswerIdSchema });
const ok = z.object({ ok: z.literal(true) });

export const listQuestionsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/questions',
  query: z.object({
    module: ModuleIdSchema.optional(),
    lecture: LectureIdSchema.optional(),
    concept: idSchema('concept').optional(),
    kind: QuestionKindSchema.optional(),
    status: QuestionStatusSchema.optional(),
    q: z.string().max(200).optional(),
  }),
  response: z.object({ questions: z.array(QuestionSchema) }),
});
export const createQuestionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/questions',
  status: 201,
  body: QuestionInputSchema,
  response: QuestionSchema,
});
export const getQuestionEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/questions/:id',
  params: QuestionParams,
  response: QuestionSchema,
});
export const updateQuestionEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/questions/:id',
  params: QuestionParams,
  body: QuestionInputSchema.partial(),
  response: QuestionSchema,
});
export const deleteQuestionEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/questions/:id',
  params: QuestionParams,
  response: ok,
});

export const listQuizzesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/quizzes',
  response: z.object({ quizzes: z.array(QuizSummarySchema) }),
});
export const previewQuizEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/quizzes/preview',
  body: z.object({ config: QuizConfigSchema }),
  response: z.object({ available: z.number().int() }),
});
export const createQuizEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/quizzes',
  status: 201,
  body: QuizInputSchema,
  response: QuizSummarySchema,
});
export const getQuizEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/quizzes/:id',
  params: QuizParams,
  response: QuizDetailSchema,
});
export const deleteQuizEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/quizzes/:id',
  params: QuizParams,
  response: ok,
});
export const exportQuizEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/quizzes/:id/export',
  params: QuizParams,
  response: z.object({ filename: z.string(), content: z.string() }),
});

export const startAttemptEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/quizzes/:id/attempts',
  status: 201,
  params: QuizParams,
  response: AttemptSchema,
});
export const getAttemptEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/attempts/:id',
  params: AttemptParams,
  response: AttemptSchema,
});
export const answerEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/attempts/:id/answers',
  status: 201,
  params: AttemptParams,
  body: AnswerInputSchema,
  response: AnswerResultSchema,
});
export const saveDraftEndpoint = defineEndpoint({
  method: 'PUT',
  path: '/api/attempts/:id/draft',
  params: AttemptParams,
  body: z.object({ responses: Responses }),
  response: ok,
});
export const submitAttemptEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/attempts/:id/submit',
  params: AttemptParams,
  body: z.object({ responses: Responses }),
  response: AttemptSchema,
});
export const finishAttemptEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/attempts/:id/finish',
  params: AttemptParams,
  response: AttemptSchema,
});
export const retakeAttemptEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/attempts/:id/retake',
  status: 201,
  params: AttemptParams,
  response: QuizSummarySchema,
});
export const gradeAnswerEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/answers/:id/grade',
  params: AnswerParams,
  body: z.object({ score: SelfScoreSchema }),
  response: AnswerResultSchema,
});

export const startLearnEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/learn',
  status: 201,
  body: z.object({
    scope: LearnScopeSchema,
    timeLimitMinutes: z.number().int().min(1).max(240).optional(),
  }),
  response: LearnStateSchema,
});
export const getLearnEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/learn/:id',
  params: AttemptParams,
  response: LearnStateSchema,
});
