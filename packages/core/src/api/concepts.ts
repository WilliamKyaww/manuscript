import { z } from 'zod';
import { idSchema } from '../ids';
import { LocatorSchema } from '../sources/types';
import { defineEndpoint } from './contract';
import { ModuleIdSchema, ModuleRefSchema, TopicIdSchema } from './course';
import { NoteIdSchema, NoteRefSchema } from './notes';
import { TextPartSchema } from './search';
import { SourceIdSchema } from './sources';

/**
 * Concepts (knowledge-system.md §6, ADR-0020): the ideas being learnt. Names and aliases share one
 * case-insensitive namespace, and `[[Name]]` links to a concept when no note has that name.
 */

export const ConceptIdSchema = idSchema('concept');

export const ConceptNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => !/[[\]|#^]/.test(value),
    'Names cannot contain [ ] | # or ^ (they break links).',
  );

export const ConceptSummarySchema = z.object({
  id: ConceptIdSchema,
  name: z.string(),
  slug: z.string(),
  aliases: z.array(z.string()),
  /** 1–3 sentences of Markdown. */
  summary: z.string(),
  importance: z.number(),
  moduleIds: z.array(ModuleIdSchema),
  topicIds: z.array(TopicIdSchema),
  noteId: NoteIdSchema.nullable(),
  /** Notes linking to the concept. */
  mentionCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConceptSummary = z.infer<typeof ConceptSummarySchema>;

export const ConceptMentionSchema = z.object({
  note: NoteRefSchema,
  /** The lines that link to the concept. */
  lines: z.array(z.object({ line: z.number().int().positive(), context: z.string() })),
});

export const ConceptPassageSchema = z.object({
  source: z.object({ id: SourceIdSchema, title: z.string() }),
  section: z.object({ ordinal: z.number().int(), label: z.string() }),
  locator: LocatorSchema,
  snippet: z.array(TextPartSchema),
});

export const ConceptDetailSchema = ConceptSummarySchema.extend({
  modules: z.array(ModuleRefSchema),
  topics: z.array(z.object({ id: TopicIdSchema, title: z.string(), moduleId: ModuleIdSchema })),
  /** The backing note, when there is one. */
  note: NoteRefSchema.nullable(),
  mentions: z.array(ConceptMentionSchema),
  /** Source passages that mention the concept by name or alias (best first). */
  passages: z.array(ConceptPassageSchema),
});
export type ConceptDetail = z.infer<typeof ConceptDetailSchema>;

export const ConceptInputSchema = z.object({
  name: ConceptNameSchema,
  aliases: z.array(ConceptNameSchema).max(50).optional(),
  summary: z.string().max(4_000).optional(),
  importance: z.number().min(0.5).max(2).optional(),
  moduleIds: z.array(ModuleIdSchema).max(100).optional(),
  topicIds: z.array(TopicIdSchema).max(200).optional(),
  noteId: NoteIdSchema.nullish(),
});

const Params = z.object({ id: ConceptIdSchema });

export const listConceptsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/concepts',
  response: z.object({ concepts: z.array(ConceptSummarySchema) }),
});
export const createConceptEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/concepts',
  status: 201,
  body: ConceptInputSchema,
  response: ConceptSummarySchema,
});
export const getConceptEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/concepts/:id',
  params: Params,
  response: ConceptDetailSchema,
});
export const updateConceptEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/concepts/:id',
  params: Params,
  body: ConceptInputSchema.partial(),
  response: ConceptSummarySchema,
});
export const deleteConceptEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/concepts/:id',
  params: Params,
  response: z.object({ ok: z.literal(true) }),
});
