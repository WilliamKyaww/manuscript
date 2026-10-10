import { z } from 'zod';
import { defineEndpoint } from './contract';
import { ConceptRefSchema, ModuleRefSchema } from './course';
import { MasteryStageSchema } from './mastery';
import { NoteRefSchema } from './notes';

/**
 * Resurfacing before it matters (Phase 15): ahead of a lecture or an exam, the concepts of that module
 * you know least, why each is there, and the notes to reread — so the weak spots are in front of you
 * before the lecture builds on them, not after.
 */

export const ResurfaceItemSchema = z.object({
  kind: z.enum(['lecture', 'exam', 'deadline']),
  /** "CS301 L4 — Consensus", "CS301 Exam". */
  title: z.string(),
  /** YYYY-MM-DD. */
  date: z.string(),
  daysUntil: z.number().int(),
  module: ModuleRefSchema,
  lectureId: z.string().nullable(),
  concepts: z.array(
    z.object({
      concept: ConceptRefSchema,
      mastery: z.number().nullable(),
      stage: MasteryStageSchema,
      /** Why it is on the list, in a sentence. */
      reason: z.string(),
    }),
  ),
  notes: z.array(NoteRefSchema),
});
export type ResurfaceItem = z.infer<typeof ResurfaceItemSchema>;

export const resurfaceEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/resurface',
  query: z.object({
    /** How far ahead to look for lectures, exams and deadlines. */
    days: z.coerce.number().int().min(1).max(30).default(7),
  }),
  response: z.object({ items: z.array(ResurfaceItemSchema) }),
});
