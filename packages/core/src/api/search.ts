import { z } from 'zod';
import { MAX_QUERY_LENGTH } from '../search/query';
import { defineEndpoint } from './contract';
import { NoteRefSchema } from './notes';

/** Full-text search and recent items (knowledge-system.md §4, Phase 4). */

/** A piece of highlighted text: matched parts are shown emphasised. Never HTML. */
export const TextPartSchema = z.object({ text: z.string(), match: z.boolean() });
export type TextPart = z.infer<typeof TextPartSchema>;

export const NoteSearchResultSchema = z.object({
  kind: z.literal('note'),
  note: NoteRefSchema.extend({ type: z.string().nullable(), updatedAt: z.string() }),
  title: z.array(TextPartSchema),
  snippet: z.array(TextPartSchema),
  /** First line containing a search term, to open the note there (null when only filters matched). */
  line: z.number().int().positive().nullable(),
});

/** Source chunks join this union in Phase 5. */
export const SearchResultSchema = z.discriminatedUnion('kind', [NoteSearchResultSchema]);
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  /** Number of matches; when `totalCapped`, there are more than this (counting stops early). */
  total: z.number().int().nonnegative(),
  totalCapped: z.boolean(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  results: z.array(SearchResultSchema),
  /** Lower-case terms to highlight elsewhere (e.g. in the opened note). */
  highlights: z.array(z.string()),
  tookMs: z.number().nonnegative(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const searchEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/search',
  query: z.object({
    q: z
      .string()
      .max(MAX_QUERY_LENGTH * 2)
      .default(''),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  }),
  response: SearchResponseSchema,
});

export const RecentKindSchema = z.enum(['note']);

export const recordRecentEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/recent',
  body: z.object({ kind: RecentKindSchema, id: z.string().min(1).max(100) }),
  response: z.object({ ok: z.literal(true) }),
});

export const RecentItemSchema = z.object({
  kind: z.literal('note'),
  note: NoteRefSchema,
  openedAt: z.string(),
});
export type RecentItem = z.infer<typeof RecentItemSchema>;

export const listRecentEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/recent',
  query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
  response: z.object({ items: z.array(RecentItemSchema) }),
});
