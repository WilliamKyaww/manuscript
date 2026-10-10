import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Clock } from '../shared/clock';
import type { SqlDatabase } from './sqlite';

/**
 * Forward-only SQL migrations (ADR-0007, data-model.md §7). Files are named `NNNN_description.sql`
 * and applied in order, each in its own transaction. Applied migrations are recorded with a checksum;
 * editing an applied migration is a hard error.
 */

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  total: number;
  latest: string | null;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Location of the migrations next to this module (source tree) or next to the server bundle. */
export const defaultMigrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));

export function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function loadMigrations(dir: string = defaultMigrationsDir): Migration[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.sql'));
  } catch (error) {
    throw new MigrationError(
      `Cannot read migrations directory ${dir}: ${(error as Error).message}`,
    );
  }
  const numbers = new Set<string>();
  const migrations = files.sort().map((file) => {
    const match = FILE_PATTERN.exec(file);
    if (!match?.[1])
      throw new MigrationError(`Invalid migration file name "${file}" (expected NNNN_name.sql).`);
    if (numbers.has(match[1])) throw new MigrationError(`Duplicate migration number ${match[1]}.`);
    numbers.add(match[1]);
    const sql = readFileSync(path.join(dir, file), 'utf8');
    return { name: file.replace(/\.sql$/, ''), sql, checksum: checksum(sql) };
  });
  if (migrations.length === 0) throw new MigrationError(`No migrations found in ${dir}.`);
  return migrations;
}

interface AppliedRow {
  name: string;
  checksum: string;
}

function ensureMigrationsTable(db: SqlDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);
}

export function migrate(
  db: SqlDatabase,
  migrations: readonly Migration[],
  clock: Clock,
): MigrationResult {
  ensureMigrationsTable(db);
  const applied = db.all<AppliedRow>('SELECT name, checksum FROM _migrations ORDER BY name');
  const known = new Map(migrations.map((migration) => [migration.name, migration]));

  for (const row of applied) {
    const migration = known.get(row.name);
    if (!migration) {
      throw new MigrationError(
        `The database has migration "${row.name}" that this version does not know about. ` +
          'It was probably created by a newer version of the application.',
      );
    }
    if (migration.checksum !== row.checksum) {
      throw new MigrationError(
        `Migration "${row.name}" has changed since it was applied. Applied migrations must never be edited; ` +
          'add a new migration instead.',
      );
    }
  }

  const appliedNames = new Set(applied.map((row) => row.name));
  const pending = migrations.filter((migration) => !appliedNames.has(migration.name));
  const lastApplied = applied.at(-1)?.name;
  if (lastApplied && pending.some((migration) => migration.name < lastApplied)) {
    throw new MigrationError(
      'A pending migration is older than an applied one; migrations must be appended in order.',
    );
  }

  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.run('INSERT INTO _migrations (name, checksum, applied_at) VALUES (?, ?, ?)', [
        migration.name,
        migration.checksum,
        clock.now().toISOString(),
      ]);
    });
  }

  return {
    applied: pending.map((migration) => migration.name),
    total: applied.length + pending.length,
    latest: migrations.at(-1)?.name ?? null,
  };
}

/**
 * The migrations that would be applied, and whether the database already holds data (a new database
 * has nothing to lose, so nothing to back up before building it).
 */
export function pendingMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[],
): { pending: Migration[]; existing: boolean } {
  ensureMigrationsTable(db);
  const applied = new Set(
    db.all<{ name: string }>('SELECT name FROM _migrations').map((row) => row.name),
  );
  return {
    pending: migrations.filter((migration) => !applied.has(migration.name)),
    existing: applied.size > 0,
  };
}

export interface MigrationStatus {
  appliedMigrations: number;
  latestMigration: string | null;
}

export function migrationStatus(db: SqlDatabase): MigrationStatus {
  ensureMigrationsTable(db);
  const row = db.get<{ count: number; latest: string | null }>(
    'SELECT count(*) AS count, max(name) AS latest FROM _migrations',
  );
  return { appliedMigrations: row?.count ?? 0, latestMigration: row?.latest ?? null };
}
