import { z } from 'zod';
import { idSchema } from '../ids';
import { SourceKindSchema } from '../sources/types';
import { defineEndpoint } from './contract';
import { NoteIdSchema, NoteRefSchema } from './notes';
import { ModuleCodeSchema, SourceIdSchema } from './sources';

/**
 * Course structure (learning-system.md §1, Phase 6): courses → modules → lectures, topics and
 * assessments. Module codes are shared with files: a source belongs to the module whose code names
 * its `Sources/<code>/` folder, and a note to the module in its `module:` property (ADR-0029).
 */

export const CourseIdSchema = idSchema('course');
export const ModuleIdSchema = idSchema('module');
export const LectureIdSchema = idSchema('lecture');
export const TopicIdSchema = idSchema('topic');
export const AssessmentIdSchema = idSchema('assessment');

/** A calendar date, `YYYY-MM-DD`. */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-08.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real date.');

/** A date, or a date and time (`2026-12-14T09:30`), for deadlines. */
export const DueSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/,
    'Use a date like 2026-12-14 or 2026-12-14T09:30.',
  )
  .refine(
    (value) => !Number.isNaN(Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)),
    'Not a real date.',
  );

/** A percentage, 0–100. */
export const PercentSchema = z.number().min(0).max(100);

/** A lecture's key within its module, e.g. `L03` (notes refer to it as `COC251/L03`). */
export const LectureKeySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,19}$/,
    'Use letters, digits, dots, dashes or underscores (at most 20).',
  );

export const LectureKindSchema = z.enum(['lecture', 'lab', 'tutorial', 'workshop', 'seminar']);
export const AssessmentKindSchema = z.enum([
  'exam',
  'coursework',
  'test',
  'presentation',
  'project',
]);
export const AssessmentStatusSchema = z.enum(['planned', 'submitted', 'marked']);

export const MarkSummarySchema = z.object({
  totalWeight: z.number(),
  markedWeight: z.number(),
  pendingWeight: z.number(),
  unassignedWeight: z.number(),
  secured: z.number(),
  averageSoFar: z.number().nullable(),
  final: z.number().nullable(),
  best: z.number(),
});

export const RequirementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('secured') }),
  z.object({ kind: z.literal('needed'), average: z.number() }),
  z.object({ kind: z.literal('impossible'), best: z.number() }),
  z.object({ kind: z.literal('missed'), final: z.number() }),
]);

// --- Courses -------------------------------------------------------------------------------

export const CourseSchema = z.object({
  id: CourseIdSchema,
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  /** Target average for the course (e.g. 85). */
  targetAverage: z.number().nullable(),
  notes: z.string(),
  moduleCount: z.number().int().nonnegative(),
  marks: MarkSummarySchema,
  /** What the remaining work must average to reach the target (null without a target). */
  requirement: RequirementSchema.nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startDate: DateSchema.nullish(),
  endDate: DateSchema.nullish(),
  targetAverage: PercentSchema.nullish(),
  notes: z.string().max(20_000).optional(),
});

const IdParams = <T extends z.ZodType>(schema: T) => z.object({ id: schema });

export const listCoursesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/courses',
  response: z.object({ courses: z.array(CourseSchema) }),
});
export const createCourseEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/courses',
  status: 201,
  body: CourseInputSchema,
  response: CourseSchema,
});
export const updateCourseEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/courses/:id',
  params: IdParams(CourseIdSchema),
  body: CourseInputSchema.partial(),
  response: CourseSchema,
});
export const deleteCourseEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/courses/:id',
  params: IdParams(CourseIdSchema),
  response: z.object({ ok: z.literal(true) }),
});

// --- Modules -------------------------------------------------------------------------------

export const ModuleRefSchema = z.object({
  id: ModuleIdSchema,
  code: z.string(),
  title: z.string(),
});
export type ModuleRef = z.infer<typeof ModuleRefSchema>;

export const DeadlineSchema = z.object({
  assessmentId: AssessmentIdSchema,
  title: z.string(),
  kind: AssessmentKindSchema,
  dueAt: z.string(),
  weight: z.number(),
  module: ModuleRefSchema,
});
export type Deadline = z.infer<typeof DeadlineSchema>;

export const ModuleSummarySchema = ModuleRefSchema.extend({
  courseId: CourseIdSchema.nullable(),
  credits: z.number().nullable(),
  semester: z.string().nullable(),
  /** `#rrggbb`, or null for the default. */
  colour: z.string().nullable(),
  targetMark: z.number().nullable(),
  archived: z.boolean(),
  counts: z.object({
    lectures: z.number().int(),
    assessments: z.number().int(),
    sources: z.number().int(),
    notes: z.number().int(),
    concepts: z.number().int(),
  }),
  marks: MarkSummarySchema,
  requirement: RequirementSchema.nullable(),
  nextDeadline: DeadlineSchema.nullable(),
});
export type ModuleSummary = z.infer<typeof ModuleSummarySchema>;

export const ModuleInputSchema = z.object({
  code: ModuleCodeSchema,
  title: z.string().trim().min(1).max(200),
  courseId: CourseIdSchema.nullish(),
  credits: z.number().min(0).max(240).nullish(),
  semester: z.string().trim().max(40).nullish(),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #2f6f4e.')
    .nullish(),
  targetMark: PercentSchema.nullish(),
  archived: z.boolean().optional(),
});

export const LectureSchema = z.object({
  id: LectureIdSchema,
  moduleId: ModuleIdSchema,
  key: z.string(),
  title: z.string(),
  kind: LectureKindSchema,
  week: z.number().int().nullable(),
  heldOn: z.string().nullable(),
  ordinal: z.number().int(),
  sourceCount: z.number().int(),
  noteCount: z.number().int(),
});
export type Lecture = z.infer<typeof LectureSchema>;

export const TopicSchema = z.object({
  id: TopicIdSchema,
  moduleId: ModuleIdSchema,
  parentId: TopicIdSchema.nullable(),
  title: z.string(),
  ordinal: z.number().int(),
});
export type Topic = z.infer<typeof TopicSchema>;

export const AssessmentSchema = z.object({
  id: AssessmentIdSchema,
  moduleId: ModuleIdSchema,
  title: z.string(),
  kind: AssessmentKindSchema,
  /** Fraction of the module mark (0–1). */
  weight: z.number(),
  dueAt: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  status: AssessmentStatusSchema,
  markAchieved: z.number().nullable(),
  notes: z.string(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const SourceRefSchema = z.object({
  id: SourceIdSchema,
  title: z.string(),
  kind: SourceKindSchema,
  path: z.string(),
  status: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ConceptRefSchema = z.object({ id: idSchema('concept'), name: z.string() });
export type ConceptRef = z.infer<typeof ConceptRefSchema>;

export const ModuleDetailSchema = ModuleSummarySchema.extend({
  lectures: z.array(LectureSchema),
  topics: z.array(TopicSchema),
  assessments: z.array(AssessmentSchema),
  /** Sources filed under the module's folder. */
  sources: z.array(SourceRefSchema),
  /** Notes whose `module` property is this module. */
  notes: z.array(NoteRefSchema),
  concepts: z.array(ConceptRefSchema),
});
export type ModuleDetail = z.infer<typeof ModuleDetailSchema>;

export const listModulesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/modules',
  response: z.object({ modules: z.array(ModuleSummarySchema) }),
});
export const createModuleEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/modules',
  status: 201,
  body: ModuleInputSchema,
  response: ModuleSummarySchema,
});
export const getModuleEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/modules/:id',
  params: IdParams(ModuleIdSchema),
  response: ModuleDetailSchema,
});
export const updateModuleEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/modules/:id',
  params: IdParams(ModuleIdSchema),
  body: ModuleInputSchema.partial(),
  response: ModuleSummarySchema,
});
export const deleteModuleEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/modules/:id',
  params: IdParams(ModuleIdSchema),
  response: z.object({ ok: z.literal(true) }),
});

// --- Lectures ------------------------------------------------------------------------------

export const LectureInputSchema = z.object({
  key: LectureKeySchema,
  title: z.string().trim().min(1).max(200),
  kind: LectureKindSchema.default('lecture'),
  week: z.number().int().min(0).max(60).nullish(),
  heldOn: DateSchema.nullish(),
  ordinal: z.number().int().min(0).max(10_000).optional(),
});

export const LectureDetailSchema = LectureSchema.extend({
  module: ModuleRefSchema,
  sources: z.array(SourceRefSchema),
  /** Notes whose `lecture` property names this lecture. */
  notes: z.array(NoteRefSchema),
  /** Concepts linked from the lecture's notes. */
  concepts: z.array(ConceptRefSchema),
});
export type LectureDetail = z.infer<typeof LectureDetailSchema>;

export const createLectureEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/modules/:id/lectures',
  status: 201,
  params: IdParams(ModuleIdSchema),
  body: LectureInputSchema,
  response: LectureSchema,
});
export const getLectureEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/lectures/:id',
  params: IdParams(LectureIdSchema),
  response: LectureDetailSchema,
});
export const updateLectureEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/lectures/:id',
  params: IdParams(LectureIdSchema),
  body: LectureInputSchema.partial(),
  response: LectureSchema,
});
export const deleteLectureEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/lectures/:id',
  params: IdParams(LectureIdSchema),
  response: z.object({ ok: z.literal(true) }),
});
export const attachLectureSourceEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/lectures/:id/sources',
  params: IdParams(LectureIdSchema),
  body: z.object({ sourceId: SourceIdSchema }),
  response: LectureDetailSchema,
});
export const detachLectureSourceEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/lectures/:id/sources/:sourceId',
  params: z.object({ id: LectureIdSchema, sourceId: SourceIdSchema }),
  response: LectureDetailSchema,
});
/** Sets the note's `module` and `lecture` properties (the file is the record, ADR-0029). */
export const attachLectureNoteEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/lectures/:id/notes',
  params: IdParams(LectureIdSchema),
  body: z.object({ noteId: NoteIdSchema }),
  response: LectureDetailSchema,
});
/** Removes the note's `lecture` property. */
export const detachLectureNoteEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/lectures/:id/notes/:noteId',
  params: z.object({ id: LectureIdSchema, noteId: NoteIdSchema }),
  response: LectureDetailSchema,
});

// --- Topics and assessments ------------------------------------------------------------------

export const TopicInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  parentId: TopicIdSchema.nullish(),
  ordinal: z.number().int().min(0).max(10_000).optional(),
});

export const createTopicEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/modules/:id/topics',
  status: 201,
  params: IdParams(ModuleIdSchema),
  body: TopicInputSchema,
  response: TopicSchema,
});
export const updateTopicEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/topics/:id',
  params: IdParams(TopicIdSchema),
  body: TopicInputSchema.partial(),
  response: TopicSchema,
});
export const deleteTopicEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/topics/:id',
  params: IdParams(TopicIdSchema),
  response: z.object({ ok: z.literal(true) }),
});

export const AssessmentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: AssessmentKindSchema,
  /** Fraction of the module mark, more than 0 and at most 1. */
  weight: z.number().gt(0).max(1),
  dueAt: DueSchema.nullish(),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullish(),
  status: AssessmentStatusSchema.optional(),
  markAchieved: PercentSchema.nullish(),
  notes: z.string().max(20_000).optional(),
});

export const createAssessmentEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/modules/:id/assessments',
  status: 201,
  params: IdParams(ModuleIdSchema),
  body: AssessmentInputSchema,
  response: AssessmentSchema,
});
export const updateAssessmentEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/assessments/:id',
  params: IdParams(AssessmentIdSchema),
  body: AssessmentInputSchema.partial(),
  response: AssessmentSchema,
});
export const deleteAssessmentEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/assessments/:id',
  params: IdParams(AssessmentIdSchema),
  response: z.object({ ok: z.literal(true) }),
});

export const listDeadlinesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/deadlines',
  query: z.object({ days: z.coerce.number().int().min(1).max(366).default(14) }),
  response: z.object({ deadlines: z.array(DeadlineSchema) }),
});
