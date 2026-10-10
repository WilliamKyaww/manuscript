import { z } from 'zod';
import { idSchema } from '../ids';
import { defineEndpoint } from './contract';
import { LectureIdSchema } from './course';
import { JobSummarySchema } from './jobs';

/**
 * The lecture pipeline (learning-system.md, Phase 15): from a lecture's material to a summary note,
 * concepts and links, flashcards, questions and a quiz — all of it waiting in the Inbox as drafts and
 * suggestions, never straight into the knowledge base unless auto-accept is on for that kind.
 */

export const PipelineRunIdSchema = idSchema('pipelineRun');

export const PIPELINE_STEPS = ['note', 'concepts', 'cards', 'questions', 'quiz'] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export const PipelineStepSchema = z.enum(PIPELINE_STEPS);

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  note: 'A summary note',
  concepts: 'Concepts and links',
  cards: 'Flashcards',
  questions: 'Questions',
  quiz: 'A quiz of those questions',
};

export const PipelineSettingsSchema = z.object({
  /** Run by itself when material is attached to a lecture (off by default: each run costs money). */
  autoRun: z.boolean(),
  note: z.boolean(),
  concepts: z.boolean(),
  cards: z.boolean(),
  questions: z.boolean(),
  quiz: z.boolean(),
});
export type PipelineSettings = z.infer<typeof PipelineSettingsSchema>;

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  autoRun: false,
  note: true,
  concepts: true,
  cards: true,
  questions: true,
  quiz: true,
};

export const PIPELINE_STEP_STATUSES = ['pending', 'running', 'done', 'skipped', 'failed'] as const;

export const PipelineStepResultSchema = z.object({
  step: PipelineStepSchema,
  status: z.enum(PIPELINE_STEP_STATUSES),
  /** What came of it, or why it was skipped or failed. */
  summary: z.string(),
});
export type PipelineStepResult = z.infer<typeof PipelineStepResultSchema>;

export const PipelineRunSchema = z.object({
  id: PipelineRunIdSchema,
  lectureId: LectureIdSchema,
  /** `queued` until the worker picks it up. */
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
  trigger: z.enum(['manual', 'auto']),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  steps: z.array(PipelineStepResultSchema),
  /** Progress while it runs (0–1). */
  progress: z.number(),
  message: z.string().nullable(),
  job: JobSummarySchema.nullable(),
});
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export const getPipelineSettingsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/settings/pipeline',
  response: PipelineSettingsSchema,
});
export const updatePipelineSettingsEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/settings/pipeline',
  body: PipelineSettingsSchema.partial(),
  response: PipelineSettingsSchema,
});

export const runPipelineEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/lectures/:id/pipeline',
  status: 201,
  params: z.object({ id: LectureIdSchema }),
  /** Steps to run this time; the settings decide those left out. */
  body: z.object({ steps: z.array(PipelineStepSchema).min(1).optional() }).default({}),
  response: PipelineRunSchema,
});

export const getPipelineEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/lectures/:id/pipeline',
  params: z.object({ id: LectureIdSchema }),
  response: z.object({ run: PipelineRunSchema.nullable() }),
});
