import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Backup, BackupReason } from '@skb/core';
import type { SqlDatabase } from './sqlite';

/**
 * Backups of the database (task 17.01). `VACUUM INTO` writes a complete, consistent, compacted copy
 * while the database is in use, and nothing half-written is ever left under a real name: the copy is
 * made under `.partial` and renamed. Names carry the time and the reason, so the folder can be read
 * (and pruned) without a database.
 */

export const BACKUP_KEEP: Record<BackupReason, number> = { daily: 14, migration: 5, manual: 10 };

const NAME = /^skb-(\d{8})-(\d{6})-(daily|migration|manual)(?:-[\w.-]+)?\.db$/u;

const pad = (value: number) => String(value).padStart(2, '0');
const stamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
  `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;

/** The moment a backup name says it was made. */
function madeAt(date: string, time: string): string {
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`;
  return iso;
}

/** Makes a backup of `db` in `directory`. `label` (a migration name, say) is added to the file name. */
export function createBackup(
  db: SqlDatabase,
  directory: string,
  at: Date,
  reason: BackupReason,
  label?: string,
): Backup {
  mkdirSync(directory, { recursive: true });
  const suffix = label ? `-${label.replace(/[^\w.-]+/gu, '_').slice(0, 60)}` : '';
  const name = `skb-${stamp(at)}-${reason}${suffix}.db`;
  const target = path.join(directory, name);
  const partial = `${target}.partial`;
  rmSync(partial, { force: true });
  try {
    db.exec(`VACUUM INTO '${partial.replace(/'/gu, "''")}'`);
    renameSync(partial, target);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  return { name, reason, sizeBytes: statSync(target).size, createdAt: at.toISOString() };
}

/** The backups in `directory`, newest first. Anything else in the folder is ignored. */
export function listBackups(directory: string): Backup[] {
  if (!existsSync(directory)) return [];
  const found: Backup[] = [];
  for (const entry of readdirSync(directory)) {
    const match = NAME.exec(entry);
    if (!match) continue;
    const [, date, time, reason] = match as unknown as [string, string, string, BackupReason];
    found.push({
      name: entry,
      reason,
      sizeBytes: statSync(path.join(directory, entry)).size,
      createdAt: madeAt(date, time),
    });
  }
  return found.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name),
  );
}

/** Removes copies a crash left half-made (nothing is making one when the application starts). */
export function removeUnfinishedBackups(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.partial')) continue;
    rmSync(path.join(directory, entry), { force: true });
    removed.push(entry);
  }
  return removed;
}

/** Removes the oldest backups of each reason beyond what is kept; returns the names removed. */
export function pruneBackups(
  directory: string,
  keep: Record<BackupReason, number> = BACKUP_KEEP,
): string[] {
  const removed: string[] = [];
  for (const reason of Object.keys(keep) as BackupReason[]) {
    const mine = listBackups(directory).filter((backup) => backup.reason === reason);
    for (const old of mine.slice(Math.max(0, keep[reason]))) {
      rmSync(path.join(directory, old.name), { force: true });
      removed.push(old.name);
    }
  }
  return removed;
}
