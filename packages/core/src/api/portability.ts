import { z } from 'zod';
import { defineEndpoint } from './contract';
import { JobSummarySchema } from './jobs';

/**
 * Portability (Phase 16): everything the student owns can leave the application in open formats and
 * come back, and a vault can be opened from anywhere — including an Obsidian vault, in place.
 */

// --- The archive ---------------------------------------------------------------------------------

export const EXPORT_FORMAT = 1;

export const ExportManifestSchema = z.object({
  /** Bumped when the layout of the archive changes in a way an older reader cannot follow. */
  format: z.number().int().positive(),
  app: z.literal('manuscript'),
  appVersion: z.string(),
  exportedAt: z.string(),
  vault: z.object({ id: z.string(), name: z.string() }),
  /** How many migrations the database had applied, to refuse an export from a newer version. */
  migrations: z.number().int().nonnegative(),
  counts: z.object({
    files: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    tables: z.record(z.string(), z.number().int().nonnegative()),
  }),
  /** The table files in `data/`, in the order they are restored. */
  tables: z.array(z.string()),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export const ExportFileSchema = z.object({
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type ExportFile = z.infer<typeof ExportFileSchema>;

export const ExportNameSchema = z.string().regex(/^manuscript-export-[\d-]+\.zip$/u);

// --- Vaults --------------------------------------------------------------------------------------

export const VaultKindSchema = z.enum(['manuscript', 'obsidian', 'folder', 'empty', 'missing']);
export type VaultKind = z.infer<typeof VaultKindSchema>;

export const VaultInspectionSchema = z.object({
  path: z.string(),
  kind: VaultKindSchema,
  /** Markdown notes found (not looking inside the app's own folder). */
  notes: z.number().int().nonnegative(),
  /** Other files: attachments, slides, PDFs. */
  files: z.number().int().nonnegative(),
  /** Whether the folder holds an `.obsidian` configuration. */
  obsidian: z.boolean(),
  current: z.boolean(),
  /** Another copy of the application has it open. */
  locked: z.boolean(),
  /** What opening it will do, in a sentence, for the confirmation. */
  summary: z.string(),
});
export type VaultInspection = z.infer<typeof VaultInspectionSchema>;

export const RecentVaultSchema = z.object({
  path: z.string(),
  name: z.string(),
  lastOpenedAt: z.string(),
  current: z.boolean(),
  exists: z.boolean(),
});
export type RecentVault = z.infer<typeof RecentVaultSchema>;

export const DataOverviewSchema = z.object({
  vault: z.object({ id: z.string(), name: z.string(), path: z.string() }),
  counts: z.object({
    notes: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    concepts: z.number().int().nonnegative(),
    cards: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
    answers: z.number().int().nonnegative(),
  }),
  exports: z.array(ExportFileSchema),
  exportsFolder: z.string(),
  recentVaults: z.array(RecentVaultSchema),
  /** The running export or restore, if there is one. */
  job: JobSummarySchema.nullable(),
  /** Whether this process can restart itself on a different vault (a launcher is watching). */
  canRestart: z.boolean(),
});
export type DataOverview = z.infer<typeof DataOverviewSchema>;

// --- Endpoints -----------------------------------------------------------------------------------

export const getDataOverviewEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/data',
  response: DataOverviewSchema,
});

export const startExportEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/export',
  status: 201,
  response: z.object({ job: JobSummarySchema }),
});

export const deleteExportEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/data/exports/:name',
  params: z.object({ name: ExportNameSchema }),
  response: z.object({ ok: z.literal(true) }),
});

export const exportDownloadPath = (name: string) =>
  `/api/data/exports/${encodeURIComponent(name)}/download`;
export const EXPORT_DOWNLOAD_ROUTE = '/api/data/exports/:name/download';

export const RestoreBodySchema = z.object({
  /** An export made here (by name), or the path of one on disk. */
  archive: z.string().trim().min(1).max(1000),
  /** A folder that does not exist yet or is empty: the new vault. */
  target: z.string().trim().min(1).max(1000),
});
export type RestoreBody = z.infer<typeof RestoreBodySchema>;

export const restoreEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/restore',
  status: 201,
  body: RestoreBodySchema,
  response: z.object({ job: JobSummarySchema }),
});

export const inspectVaultEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/vaults/inspect',
  body: z.object({ path: z.string().trim().min(1).max(1000) }),
  response: VaultInspectionSchema,
});

export const switchVaultEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/vaults/switch',
  body: z.object({ path: z.string().trim().min(1).max(1000) }),
  response: z.object({
    /**
     * True when the application is restarting on the new vault (the page reloads when it is back);
     * false when it will open the vault the next time it is started by hand.
     */
    restarting: z.boolean(),
    path: z.string(),
  }),
});

export const MaterialiseConceptsBodySchema = z.object({
  /** The folder the notes go in (default `Concepts`). */
  folder: z.string().trim().max(200).default('Concepts'),
});

export const MaterialiseConceptsResultSchema = z.object({
  folder: z.string(),
  created: z.array(z.object({ conceptId: z.string(), name: z.string(), path: z.string() })),
  /** Concepts that already have a backing note are left as they are. */
  skipped: z.number().int().nonnegative(),
});
export type MaterialiseConceptsResult = z.infer<typeof MaterialiseConceptsResultSchema>;

/** Writes a Markdown note for every concept that has none, and makes it the concept's backing note. */
export const materialiseConceptsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/concepts/materialise',
  status: 201,
  body: MaterialiseConceptsBodySchema.partial(),
  response: MaterialiseConceptsResultSchema,
});

export const forgetVaultEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/vaults/forget',
  body: z.object({ path: z.string().trim().min(1).max(1000) }),
  response: z.object({ ok: z.literal(true) }),
});

/** Reads the files again: notes, then the originals in Sources. Safe at any time. */
export const rescanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/data/rescan',
  status: 201,
  response: z.object({ job: JobSummarySchema }),
});
