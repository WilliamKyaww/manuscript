import type { Backup, Backups } from '@skb/core';
import {
  BACKUP_KEEP,
  createBackup,
  listBackups,
  pruneBackups,
  removeUnfinishedBackups,
} from '../../db/backup';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';

/**
 * Daily backups of the database (task 17.01). One is made shortly after start-up if none is under a
 * day old, then the check repeats hourly while the application runs; the oldest of each kind are
 * removed beyond what is kept. A failed backup is logged and tried again at the next check — it never
 * stops the application.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

export interface BackupDependencies {
  db: SqlDatabase;
  /** `.skb/backups`. */
  directory: string;
  clock: Clock;
  logger: Logger;
}

export type BackupService = ReturnType<typeof createBackupService>;

export function createBackupService(deps: BackupDependencies) {
  const { db, directory, clock, logger } = deps;
  // A crash during a backup leaves a .partial file; nothing is writing one now.
  removeUnfinishedBackups(directory);
  let first: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;

  const make = (reason: Backup['reason']): Backup => {
    const backup = createBackup(db, directory, clock.now(), reason);
    const removed = pruneBackups(directory);
    if (removed.length > 0) logger.info('Removed old backups', { removed });
    return backup;
  };

  /** Makes a daily backup unless one is less than a day old; returns it, or null. */
  function checkDaily(): Backup | null {
    const latest = listBackups(directory).find(
      (backup) => backup.reason === 'daily' || backup.reason === 'migration',
    );
    if (latest && clock.now().getTime() - Date.parse(latest.createdAt) < DAY_MS) return null;
    try {
      const backup = make('daily');
      logger.info('Backed up the database', { name: backup.name, sizeBytes: backup.sizeBytes });
      return backup;
    } catch (error) {
      logger.error('The daily backup failed', { error });
      return null;
    }
  }

  return {
    list(): Backups {
      return { backups: listBackups(directory), folder: directory, keep: { ...BACKUP_KEEP } };
    },

    /** A backup the student asked for. */
    backUpNow: (): Backup => make('manual'),

    checkDaily,

    start(): void {
      first = setTimeout(checkDaily, FIRST_CHECK_MS);
      first.unref();
      repeat = setInterval(checkDaily, CHECK_EVERY_MS);
      repeat.unref();
    },

    close(): void {
      if (first) clearTimeout(first);
      if (repeat) clearInterval(repeat);
      first = null;
      repeat = null;
    },
  };
}
