import { z } from 'zod';
import { defineEndpoint } from './contract';

/**
 * Database backups (Phase 17, task 17.01): a consistent copy of `.skb/skb.db` made by SQLite itself,
 * once a day while the application runs and before a migration changes the schema. They hold what the
 * database holds (the files in the vault are not copied: they are the vault).
 */

export const BackupReasonSchema = z.enum(['daily', 'migration', 'manual']);
export type BackupReason = z.infer<typeof BackupReasonSchema>;

export const BackupSchema = z.object({
  name: z.string(),
  reason: BackupReasonSchema,
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Backup = z.infer<typeof BackupSchema>;

export const BackupsSchema = z.object({
  backups: z.array(BackupSchema),
  /** Where they are (inside the vault's hidden `.skb` folder). */
  folder: z.string(),
  /** How many of each kind are kept before the oldest is removed. */
  keep: z.object({
    daily: z.number().int(),
    migration: z.number().int(),
    manual: z.number().int(),
  }),
});
export type Backups = z.infer<typeof BackupsSchema>;

export const listBackupsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/backups',
  response: BackupsSchema,
});

export const createBackupEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/backups',
  status: 201,
  response: BackupSchema,
});
