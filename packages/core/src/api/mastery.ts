import { z } from 'zod';
import { idSchema } from '../ids';
import { MASTERY_STAGES } from '../learning/mastery';
import { WEAK_SIGNALS } from '../learning/weakness';
import { defineEndpoint } from './contract';
import { ConceptRefSchema, ModuleIdSchema, ModuleRefSchema, TopicIdSchema } from './course';
import { QuestionIdSchema } from './questions';

/**
 * Mastery, readiness and weak areas (learning-system.md §§7–9, ADR-0021). Every figure comes with
 * the components it was computed from, so it can be checked by hand.
 */

export const MasteryStageSchema = z.enum(MASTERY_STAGES);
export const MasteryConfidenceSchema = z.enum(['none', 'low', 'medium', 'high']);

export const MasteryComponentsSchema = z.object({
  mastery: z.number().nullable(),
  stage: MasteryStageSchema,
  confidence: MasteryConfidenceSchema,
  /** Mean retrievability now of the reviewed card faces, and how many there are. */
  recall: z.number().nullable(),
  recallCount: z.number().int(),
  /** Recency-weighted accuracy of the last 20 answers, and their total weight. */
  accuracy: z.number().nullable(),
  answerWeight: z.number(),
  /** E = faces + 1.5 × answer weight. */
  evidence: z.number(),
  coverage: z.number().nullable(),
  itemsLinked: z.number().int(),
  itemsPractised: z.number().int(),
});
export type MasteryComponents = z.infer<typeof MasteryComponentsSchema>;

export const WeakSignalSchema = z.object({ kind: z.enum(WEAK_SIGNALS), reason: z.string() });
export type WeakSignalView = z.infer<typeof WeakSignalSchema>;

export const ExposureSchema = z.object({
  moduleId: ModuleIdSchema.nullable(),
  moduleCode: z.string().nullable(),
  assessment: z
    .object({
      id: z.string(),
      title: z.string(),
      weight: z.number(),
      daysUntil: z.number().int(),
    })
    .nullable(),
  stake: z.number(),
  urgency: z.number(),
});

export const ConceptProgressSchema = z.object({
  concept: ConceptRefSchema.extend({ importance: z.number() }),
  components: MasteryComponentsSchema,
  signals: z.array(WeakSignalSchema),
  priority: z.number(),
  exposure: ExposureSchema,
});
export type ConceptProgress = z.infer<typeof ConceptProgressSchema>;

export const RollUpSchema = z.object({
  /** Importance-weighted mean over concepts with evidence. */
  mastery: z.number().nullable(),
  /** The same with unstarted concepts counted as 0. */
  readiness: z.number().nullable(),
  coverage: z.number().nullable(),
  practised: z.number().int(),
  total: z.number().int(),
});
export type RollUpView = z.infer<typeof RollUpSchema>;

export const ModuleProgressSchema = z.object({
  module: ModuleRefSchema,
  rollUp: RollUpSchema,
  topics: z.array(
    z.object({
      id: TopicIdSchema,
      parentId: TopicIdSchema.nullable(),
      title: z.string(),
      rollUp: RollUpSchema,
    }),
  ),
  concepts: z.array(ConceptProgressSchema),
});
export type ModuleProgress = z.infer<typeof ModuleProgressSchema>;

export const ProgressOverviewSchema = z.object({
  computedAt: z.string(),
  /** Every active concept in the modules shown (and concepts in no module). */
  overall: RollUpSchema,
  modules: z.array(ModuleProgressSchema),
  /** Concepts in no module. */
  unassigned: z.array(ConceptProgressSchema),
});
export type ProgressOverview = z.infer<typeof ProgressOverviewSchema>;

export const ConceptMasteryDetailSchema = ConceptProgressSchema.extend({
  computedAt: z.string(),
  cards: z.object({ linked: z.number().int(), reviewed: z.number().int() }),
  questions: z.object({ linked: z.number().int(), answered: z.number().int() }),
  /** The answers that count (newest first), each with the weight it carries today. */
  answers: z.array(
    z.object({
      questionId: QuestionIdSchema,
      stem: z.string(),
      score: z.number(),
      assisted: z.boolean(),
      answeredAt: z.string(),
      weight: z.number(),
    }),
  ),
});
export type ConceptMasteryDetail = z.infer<typeof ConceptMasteryDetailSchema>;

export const WeakAreasSchema = z.object({
  computedAt: z.string(),
  /** Concepts with a weak, slipping, lapsing or forgotten signal, by priority. */
  items: z.array(ConceptProgressSchema),
  /** Concepts with nothing to practise yet. */
  noMaterial: z.array(ConceptRefSchema),
});
export type WeakAreas = z.infer<typeof WeakAreasSchema>;

export const progressEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/progress',
  query: z.object({ module: ModuleIdSchema.optional() }),
  response: ProgressOverviewSchema,
});
export const conceptMasteryEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/mastery/concepts/:id',
  params: z.object({ id: idSchema('concept') }),
  response: ConceptMasteryDetailSchema,
});
export const weakAreasEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/mastery/weak',
  query: z.object({
    module: ModuleIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  }),
  response: WeakAreasSchema,
});
