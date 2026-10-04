import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../shared/clock';
import {
  checksum,
  loadMigrations,
  type Migration,
  MigrationError,
  migrate,
  migrationStatus,
} from './migrate';
import { openDatabase, type SqlDatabase } from './sqlite';

const clock = new FixedClock('2026-10-04T12:00:00.000Z');
const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});

function db(): SqlDatabase {
  const database = openDatabase(':memory:');
  cleanup.push(() => database.close());
  return database;
}

function migrationDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-migrations-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(dir, { recursive: true });
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return dir;
}

const m = (name: string, sql: string): Migration => ({ name, sql, checksum: checksum(sql) });

describe('migrations', () => {
  it('loads the shipped migrations in order', () => {
    const migrations = loadMigrations();
    expect(migrations[0]?.name).toBe('0001_init');
    const names = migrations.map((migration) => migration.name);
    expect(names).toEqual([...names].sort());
  });

  it('applies pending migrations once and records them', () => {
    const database = db();
    const migrations = [
      m('0001_a', 'CREATE TABLE a (id INTEGER) STRICT;'),
      m('0002_b', 'CREATE TABLE b (id INTEGER) STRICT;'),
    ];
    const first = migrate(database, migrations, clock);
    expect(first.applied).toEqual(['0001_a', '0002_b']);
    expect(first.latest).toBe('0002_b');
    const second = migrate(database, migrations, clock);
    expect(second.applied).toEqual([]);
    expect(migrationStatus(database)).toEqual({ appliedMigrations: 2, latestMigration: '0002_b' });
    const row = database.get<{ applied_at: string }>(
      "SELECT applied_at FROM _migrations WHERE name = '0001_a'",
    );
    expect(row?.applied_at).toBe('2026-10-04T12:00:00.000Z');
  });

  it('applies the shipped migrations to a fresh database', () => {
    const database = db();
    migrate(database, loadMigrations(), clock);
    expect(
      database.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'"),
    ).toBeDefined();
  });

  it('rolls back a failing migration and leaves earlier ones applied', () => {
    const database = db();
    const migrations = [
      m('0001_a', 'CREATE TABLE a (id INTEGER) STRICT;'),
      m('0002_bad', 'CREATE TABLE b (id INTEGER); THIS IS NOT SQL;'),
    ];
    expect(() => migrate(database, migrations, clock)).toThrow();
    expect(migrationStatus(database)).toEqual({ appliedMigrations: 1, latestMigration: '0001_a' });
    expect(database.get("SELECT name FROM sqlite_master WHERE name = 'b'")).toBeUndefined();
  });

  it('refuses edited applied migrations', () => {
    const database = db();
    migrate(database, [m('0001_a', 'CREATE TABLE a (id INTEGER) STRICT;')], clock);
    expect(() =>
      migrate(database, [m('0001_a', 'CREATE TABLE a (id TEXT) STRICT;')], clock),
    ).toThrow(/has changed/);
  });

  it('refuses a database from a newer version', () => {
    const database = db();
    migrate(database, [m('0001_a', 'SELECT 1;'), m('0002_b', 'SELECT 1;')], clock);
    expect(() => migrate(database, [m('0001_a', 'SELECT 1;')], clock)).toThrow(/newer version/);
  });

  it('treats line-ending differences as the same checksum', () => {
    expect(checksum('A;\r\nB;')).toBe(checksum('A;\nB;'));
  });

  it('validates migration file names and numbering', () => {
    expect(() => loadMigrations(migrationDir({ 'init.sql': 'SELECT 1;' }))).toThrow(MigrationError);
    expect(() =>
      loadMigrations(migrationDir({ '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 1;' })),
    ).toThrow(/Duplicate/);
    expect(() => loadMigrations(migrationDir({}))).toThrow(/No migrations/);
    const loaded = loadMigrations(
      migrationDir({ '0002_b.sql': 'SELECT 2;', '0001_a.sql': 'SELECT 1;' }),
    );
    expect(loaded.map((migration) => migration.name)).toEqual(['0001_a', '0002_b']);
  });
});
