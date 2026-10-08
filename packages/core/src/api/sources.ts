import { z } from 'zod';
import { idSchema } from '../ids';
import { LocatorSchema, SourceKindSchema, SourceStatusSchema } from '../sources/types';
import { defineEndpoint } from './contract';
import { JobSummarySchema } from './jobs';

/** Source library (Phase 5): imported originals, their parsed sections and ingestion state. */

export const SourceIdSchema = idSchema('source');

/** Largest original accepted for import. */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

/** The folder inside `Sources/` for a module (Phase 6 makes modules entities; until then a code). */
export const ModuleCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/,
    'Use letters, digits, spaces, dots, dashes or underscores (at most 40 characters).',
  )
  .refine((value) => !/[. ]$/.test(value), 'A module code may not end with a dot or space.');

export const SourceWarningSchema = z.object({ code: z.string(), message: z.string() });

export const SourceSummarySchema = z.object({
  id: SourceIdSchema,
  kind: SourceKindSchema,
  title: z.string(),
  /** Vault-relative path of the original. */
  path: z.string(),
  /** File name as it was imported. */
  originalName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  /** Pages (PDF) or slides (PPTX), once parsed. */
  pageCount: z.number().int().nonnegative().nullable(),
  status: SourceStatusSchema,
  /** Why the last ingestion failed. */
  error: z.string().nullable(),
  /** Module folder (`Sources/<module>/`), or null for the inbox. */
  moduleCode: z.string().nullable(),
  sectionCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  warnings: z.array(SourceWarningSchema),
  /** The original is no longer in the vault (moved away or deleted outside the app). */
  missing: z.boolean(),
  createdAt: z.string(),
  ingestedAt: z.string().nullable(),
  /** The ingestion job while it is queued or running. */
  job: JobSummarySchema.nullable(),
});
export type SourceSummary = z.infer<typeof SourceSummarySchema>;

export const SourceSectionSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(['page', 'slide', 'heading', 'segment']),
  label: z.string(),
  headingPath: z.array(z.string()),
  locator: LocatorSchema,
  text: z.string(),
  notes: z.string().nullable(),
});
export type SourceSection = z.infer<typeof SourceSectionSchema>;

const SourceParams = z.object({ id: SourceIdSchema });

export const listSourcesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/sources',
  response: z.object({ sources: z.array(SourceSummarySchema) }),
});

export const getSourceEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/sources/:id',
  params: SourceParams,
  response: SourceSummarySchema.extend({
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
});

export const sourceSectionsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/sources/:id/sections',
  params: SourceParams,
  response: z.object({ sections: z.array(SourceSectionSchema) }),
});

export const ImportResultSchema = z.object({
  source: SourceSummarySchema,
  /** The same file (by SHA-256) was already in the library; nothing was copied. */
  duplicate: z.boolean(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/** `POST` multipart/form-data: `file`, optional `module`. Responds with `ImportResultSchema`. */
export const SOURCE_UPLOAD_PATH = '/api/sources';

/** Imports a file the server can read directly (desktop file picker; files already in the vault). */
export const importSourcePathEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/sources/import-path',
  status: 201,
  body: z.object({ path: z.string().min(1).max(4096), module: ModuleCodeSchema.nullish() }),
  response: ImportResultSchema,
});

export const retrySourceEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/sources/:id/retry',
  params: SourceParams,
  response: SourceSummarySchema,
});

/** Moves the original to the trash; restoring it from the trash brings the source back. */
export const deleteSourceEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/sources/:id',
  params: SourceParams,
  response: z.object({ ok: z.literal(true), trashId: z.string().nullable() }),
});
