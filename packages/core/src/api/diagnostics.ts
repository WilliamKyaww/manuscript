import { z } from 'zod';
import { defineEndpoint } from './contract';

/**
 * Diagnostics (Phase 17, task 17.06): what is running, what the background jobs and the database are
 * doing, the recent log, and a bundle of those that can be sent to someone who is helping — with no
 * note text and no keys in it.
 */

export const DiagnosticsSchema = z.object({
  app: z.object({
    version: z.string(),
    mode: z.string(),
    startedAt: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    node: z.string(),
    platform: z.string(),
  }),
  vault: z.object({ name: z.string(), path: z.string() }),
  database: z.object({
    sqliteVersion: z.string(),
    migrations: z.number().int().nonnegative(),
    latestMigration: z.string().nullable(),
    sizeBytes: z.number().int().nonnegative(),
    walBytes: z.number().int().nonnegative(),
  }),
  counts: z.object({
    notes: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    concepts: z.number().int().nonnegative(),
    cards: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
  }),
  jobs: z.object({
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    recentFailures: z.array(
      z.object({ kind: z.string(), error: z.string(), updatedAt: z.string() }),
    ),
  }),
  backups: z.object({ count: z.number().int().nonnegative(), latestAt: z.string().nullable() }),
  logs: z.object({
    folder: z.string(),
    files: z.array(z.object({ name: z.string(), sizeBytes: z.number().int().nonnegative() })),
  }),
});
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const LogEntrySchema = z.object({
  time: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  /** Everything else on the line (already stripped of keys and tokens when it was written). */
  fields: z.record(z.string(), z.unknown()),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const getDiagnosticsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/diagnostics',
  response: DiagnosticsSchema,
});

export const logsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/diagnostics/logs',
  query: z.object({
    /** This level and above. */
    level: LogLevelSchema.default('info'),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }),
  response: z.object({ entries: z.array(LogEntrySchema), truncated: z.boolean() }),
});

/** A zip of the diagnostics, the log and the non-secret settings: `GET`, saved by the browser. */
export const DIAGNOSTICS_BUNDLE_PATH = '/api/diagnostics/bundle';
