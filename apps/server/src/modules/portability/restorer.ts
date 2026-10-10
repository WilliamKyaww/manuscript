import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  EXPORT_FORMAT,
  type ExportManifest,
  ExportManifestSchema,
  NotFoundError,
  VAULT_META_DIR,
  ValidationError,
} from '@skb/core';
import { loadMigrations, migrate } from '../../db/migrate';
import { openDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import { CANONICAL_TABLES, writeTable } from './tables';
import { readZip } from './zip';

/**
 * Restoring an export into a new vault (task 16.02): the files go back where they were, the tables of
 * the student's own data are loaded into a fresh database, and everything derived — the note index,
 * what was read from sources, the graph's clusters — is made again by the application on first open.
 * The target must not exist or must be empty: a restore never merges into, or overwrites, a vault.
 */

export interface RestoreOptions {
  archive: string;
  target: string;
  /** The vault in use now: the new vault may not be inside it, nor contain it. */
  currentVault: string;
  /** How many migrations this version knows, to refuse an export from a newer one. */
  knownMigrations: number;
  migrationsDir?: string;
  clock: Clock;
  progress(fraction: number, message: string): void;
  signal: AbortSignal;
}

export interface RestoreResult {
  vaultPath: string;
  manifest: ExportManifest;
  files: number;
  rows: number;
  /** Entries that were left out and why (for the journal of the restore). */
  skipped: string[];
}

const isInside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** The path of an entry relative to the export's own root folder. */
function entryPath(name: string): string {
  const first = name.split('/')[0] ?? '';
  return ['manifest.json', 'data', 'vault'].includes(first)
    ? name
    : name.split('/').slice(1).join('/');
}

export async function restoreArchive(options: RestoreOptions): Promise<RestoreResult> {
  const { archive, clock, progress, signal } = options;
  const target = path.resolve(options.target);
  if (!existsSync(archive)) throw new NotFoundError('That export file does not exist.');
  if (isInside(options.currentVault, target) || isInside(target, options.currentVault))
    throw new ValidationError(
      'Choose a folder outside the vault you are using: a restore makes a separate vault.',
    );
  if (existsSync(target)) {
    if (!statSync(target).isDirectory())
      throw new ValidationError('The restore target is a file, not a folder.');
    if (readdirSync(target).length > 0)
      throw new ValidationError(
        'That folder is not empty. Choose a new or empty folder: a restore never merges into a vault.',
      );
  }
  mkdirSync(target, { recursive: true });

  const skipped: string[] = [];
  const memory = new Map<string, Uint8Array>();
  let files = 0;
  try {
    progress(0.02, 'Reading the archive');
    await readZip(archive, (name) => {
      if (signal.aborted) throw new Error('The restore was cancelled.');
      const entry = entryPath(name);
      if (entry === 'manifest.json' || (entry.startsWith('data/') && entry.endsWith('.json')))
        return { kind: 'memory', done: (data) => memory.set(entry, data) };
      if (!entry.startsWith('vault/')) return { kind: 'skip' };
      const relative = entry.slice('vault/'.length);
      const parts = relative.split('/');
      // The application's own folder is never taken from an archive, and a colon would address an
      // alternate data stream on Windows.
      if (
        parts[0] === VAULT_META_DIR ||
        relative.includes(':') ||
        parts.some((part) => part === '')
      ) {
        skipped.push(`${relative}: not a file that can be restored`);
        return { kind: 'skip' };
      }
      files += 1;
      return { kind: 'file', path: path.join(target, ...parts) };
    });
    if (signal.aborted) throw new Error('The restore was cancelled.');

    const manifestBytes = memory.get('manifest.json');
    if (!manifestBytes)
      throw new ValidationError('That is not a Manuscript export: it has no manifest.json.');
    let manifest: ExportManifest;
    try {
      manifest = ExportManifestSchema.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));
    } catch {
      throw new ValidationError('That is not a Manuscript export: its manifest cannot be read.');
    }
    if (manifest.format > EXPORT_FORMAT || manifest.migrations > options.knownMigrations)
      throw new ValidationError(
        'That export was made by a newer version of Manuscript. Update the application, then restore it.',
      );

    progress(0.6, 'Building the new vault');
    const meta = path.join(target, VAULT_META_DIR);
    mkdirSync(meta, { recursive: true });
    const db = openDatabase(path.join(meta, 'skb.db'));
    let rows = 0;
    try {
      migrate(db, loadMigrations(options.migrationsDir), clock);
      // Rows arrive parents first, but a few tables point at each other; check at the end instead.
      db.exec('PRAGMA foreign_keys = OFF');
      db.transaction(() => {
        for (const table of CANONICAL_TABLES) {
          const bytes = memory.get(`data/${table.name}.json`);
          if (!bytes) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            throw new ValidationError(`data/${table.name}.json is not valid JSON.`);
          }
          if (!Array.isArray(parsed))
            throw new ValidationError(`data/${table.name}.json is not a list of rows.`);
          rows += writeTable(db, table.name, parsed as Record<string, unknown>[]);
        }
        // What was read from the originals is made again; the originals themselves came with the files.
        db.run(
          `UPDATE sources SET status = 'pending', error = NULL, parser_version = NULL,
             ingested_sha256 = NULL, ingested_at = NULL, missing_at = NULL
           WHERE deleted_at IS NULL`,
        );
        const broken = db.all('PRAGMA foreign_key_check');
        if (broken.length > 0)
          throw new ValidationError(
            `The export is inconsistent: ${broken.length} rows refer to something that is not there.`,
          );
      });
      db.exec('PRAGMA foreign_keys = ON');
    } finally {
      db.close();
    }
    progress(1, 'Restored');
    return { vaultPath: target, manifest, files, rows, skipped };
  } catch (error) {
    // The target was missing or empty when we began, so removing it leaves nothing behind.
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}
