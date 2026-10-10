import { z } from 'zod';
import { idSchema } from '../ids';
import { DEFAULT_AVAILABILITY, PLAN, PLAN_ITEM_KINDS } from '../learning/planner';
import { defineEndpoint } from './contract';

/**
 * The study plan (learning-system.md §9, Phase 14): what to do on each of the coming days, why, and
 * what has been done. Items explain themselves; the plan is rolling and keeps what is finished.
 */

export const PlanIdSchema = idSchema('plan');
export const PlanItemIdSchema = idSchema('planItem');

export const PLAN_ITEM_STATUSES = ['planned', 'done', 'skipped'] as const;
export const PlanItemStatusSchema = z.enum(PLAN_ITEM_STATUSES);
export const PlanItemKindSchema = z.enum(PLAN_ITEM_KINDS);

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Dates look like 2026-10-09.');

export const PlanItemSchema = z.object({
  id: PlanItemIdSchema,
  planId: PlanIdSchema,
  date: DateSchema,
  kind: PlanItemKindSchema,
  targetType: z.enum(['module', 'concept', 'lecture', 'assessment', 'cards']).nullable(),
  targetId: z.string().nullable(),
  title: z.string(),
  minutes: z.number().int(),
  /** Why this is here, in the student's terms. */
  reason: z.string(),
  status: PlanItemStatusSchema,
  completedAt: z.string().nullable(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const StudyPlanSchema = z.object({
  id: PlanIdSchema,
  title: z.string(),
  startDate: DateSchema,
  endDate: DateSchema,
  generatedBy: z.enum(['planner', 'agent']),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(PlanItemSchema),
  /** Things the planner could not fit in, and why. */
  unscheduled: z.array(z.object({ title: z.string(), reason: z.string() })),
  /** Minutes the student set aside on each date of the plan. */
  capacity: z.array(z.object({ date: DateSchema, minutes: z.number().int() })),
});
export type StudyPlan = z.infer<typeof StudyPlanSchema>;

// --- Availability and preferences ---------------------------------------------------------------

export const PlanSettingsSchema = z.object({
  /** Minutes available on Monday … Sunday. */
  minutesByWeekday: z.array(z.number().int().min(0).max(960)).length(7),
  /** Days with no study at all. */
  blockedDates: z.array(DateSchema).max(366),
  /** How long one sitting is. */
  sessionMinutes: z.number().int().min(15).max(90),
  /** Raise a module's cards to 0.93 retention in the fortnight before its exam. */
  examRetention: z.boolean(),
});
export type PlanSettings = z.infer<typeof PlanSettingsSchema>;

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  minutesByWeekday: [...DEFAULT_AVAILABILITY.minutesByWeekday],
  blockedDates: [],
  sessionMinutes: DEFAULT_AVAILABILITY.sessionMinutes,
  examRetention: true,
};

// --- Endpoints ----------------------------------------------------------------------------------

export const getPlanSettingsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/settings/plan',
  response: PlanSettingsSchema,
});
export const updatePlanSettingsEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/settings/plan',
  body: PlanSettingsSchema.partial(),
  response: PlanSettingsSchema,
});

export const getPlanEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/plan',
  /** The current plan, or null before one has been made. */
  response: z.object({ plan: StudyPlanSchema.nullable(), today: DateSchema }),
});

export const generatePlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/plan/generate',
  body: z.object({
    days: z.number().int().min(1).max(PLAN.maxDays).default(PLAN.defaultDays),
  }),
  response: StudyPlanSchema,
});

export const updatePlanItemEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/plan/items/:id',
  params: z.object({ id: PlanItemIdSchema }),
  body: z.object({ status: PlanItemStatusSchema }),
  response: PlanItemSchema,
});
