import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupsSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonApi } from '../../../test/api-helpers';
import { createTestApp } from '../../../test/helpers';
import type { ServerConfig } from '../../config/config';
import { createBackup, listBackups, pruneBackups } from '../../db/backup';
import { loadMigrations, migrate } from '../../db/migrate';
import { openDatabase } from '../../db/sqlite';
import { startServer } from '../../server';
import { FixedClock } from '../../shared/clock';
import { silentLogger } from '../../shared/logger';
import { createBackupService } from './service';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const temp = () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-backup-'));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
};

function database() {
  const folder = temp();
  const db = openDatabase(path.join(folder, 'skb.db'));
  cleanups.push(() => db.close());
  db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL) STRICT');
  db.run('INSERT INTO notes VALUES (?, ?)', ['a', 'Raft']);
  db.run('INSERT INTO notes VALUES (?, ?)', ['b', 'Paxos']);
  return { db, folder };
}

describe('database backups', () => {
  it('copies the whole database consistently under a readable name, leaving nothing half-made', () => {
    const { db, folder } = database();
    const backups = path.join(folder, 'backups');
    const made = createBackup(db, backups, new Date('2026-10-10T09:30:05Z'), 'daily');
    expect(made.name).toBe('skb-20261010-093005-daily.db');
    expect(made.reason).toBe('daily');
    expect(made.sizeBytes).toBeGreaterThan(0);
    expect(readdirSync(backups)).toEqual([made.name]);

    // Later changes are not in it; it opens and holds what was there.
    db.run('DELETE FROM notes');
    const copy = openDatabase(path.join(backups, made.name), { readOnly: true });
    expect(copy.all('SELECT id, title FROM notes ORDER BY id')).toEqual([
      { id: 'a', title: 'Raft' },
      { id: 'b', title: 'Paxos' },
    ]);
    expect(copy.get<{ integrity_check: string }>('PRAGMA integrity_check')?.integrity_check).toBe(
      'ok',
    );
    copy.close();

    expect(listBackups(backups)).toEqual([
      {
        name: made.name,
        reason: 'daily',
        sizeBytes: made.sizeBytes,
        createdAt: '2026-10-10T09:30:05.000Z',
      },
    ]);
  });

  it('keeps the newest of each kind, and leaves other files alone', () => {
    const { db, folder } = database();
    const backups = path.join(folder, 'backups');
    for (let day = 1; day <= 5; day += 1)
      createBackup(db, backups, new Date(Date.UTC(2026, 9, day, 6)), 'daily');
    createBackup(db, backups, new Date(Date.UTC(2026, 9, 2, 7)), 'migration', '0016_code_graphs');
    createBackup(db, backups, new Date(Date.UTC(2026, 9, 3, 7)), 'migration', '0017_next');
    writeFileSync(path.join(backups, 'notes.txt'), 'mine');

    const removed = pruneBackups(backups, { daily: 2, migration: 1, manual: 5 });
    expect(removed.sort()).toEqual([
      'skb-20261001-060000-daily.db',
      'skb-20261002-060000-daily.db',
      'skb-20261002-070000-migration-0016_code_graphs.db',
      'skb-20261003-060000-daily.db',
    ]);
    expect(listBackups(backups).map((backup) => backup.name)).toEqual([
      'skb-20261005-060000-daily.db',
      'skb-20261004-060000-daily.db',
      'skb-20261003-070000-migration-0017_next.db',
    ]);
    expect(readdirSync(backups)).toContain('notes.txt');
  });
});

describe('the daily backup', () => {
  it('is made once a day, by itself, and a failing one does not stop anything', () => {
    const { db, folder } = database();
    const backups = path.join(folder, 'backups');
    const clock = new FixedClock('2026-10-10T08:00:00.000Z');
    const service = createBackupService({ db, directory: backups, clock, logger: silentLogger });

    expect(service.checkDaily()?.name).toBe('skb-20261010-080000-daily.db');
    // Not again the same day, nor an hour later…
    clock.advance(60 * 60 * 1000);
    expect(service.checkDaily()).toBeNull();
    // …but the next day.
    clock.advance(24 * 60 * 60 * 1000);
    expect(service.checkDaily()?.name).toBe('skb-20261011-090000-daily.db');
    expect(service.list().backups.map((backup) => backup.reason)).toEqual(['daily', 'daily']);

    // A folder that cannot be written to is logged and tried again later.
    writeFileSync(path.join(folder, 'in-the-way'), 'a file, not a folder');
    const broken = createBackupService({
      db,
      directory: path.join(folder, 'in-the-way', 'backups'),
      clock,
      logger: silentLogger,
    });
    expect(broken.checkDaily()).toBeNull();
  });
});

describe('after a crash', () => {
  it('removes a backup that was cut short, and keeps the real ones', () => {
    const { db, folder } = database();
    const backups = path.join(folder, 'backups');
    const real = createBackup(db, backups, new Date('2026-10-10T09:00:00Z'), 'daily');
    writeFileSync(path.join(backups, 'skb-20261010-100000-daily.db.partial'), 'half');
    const clock = new FixedClock('2026-10-10T10:00:00.000Z');
    createBackupService({ db, directory: backups, clock, logger: silentLogger });
    expect(readdirSync(backups)).toEqual([real.name]);
  });
});

describe('before a migration', () => {
  it('keeps the database as it was, and only when there is something to keep', async () => {
    const root = temp();
    const config: ServerConfig = {
      mode: 'test',
      host: '127.0.0.1',
      port: 0,
      vaultPath: path.join(root, 'vault'),
      dataDir: path.join(root, 'data'),
      webDir: null,
      logLevel: 'error',
      openBrowser: false,
      devWebOrigin: null,
      authTokenOverride: 'backup-test-token-0123456789-abcdefghijklmno',
      aiMock: false,
    };
    const clock = new FixedClock('2026-10-10T10:00:00.000Z');
    const all = loadMigrations();

    // A first start builds the database: nothing to back up.
    const first = await startServer(config, { logger: silentLogger, clock, watch: false });
    await first.close();
    expect(listBackups(path.join(config.vaultPath, '.skb', 'backups'))).toEqual([]);

    // A database from an older version, with data in it.
    const dbPath = path.join(config.vaultPath, '.skb', 'skb.db');
    rmSync(dbPath);
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    const old = openDatabase(dbPath);
    migrate(old, all.slice(0, 14), clock);
    old.close();

    const second = await startServer(config, { logger: silentLogger, clock, watch: false });
    cleanups.push(() => second.close());
    const made = listBackups(path.join(config.vaultPath, '.skb', 'backups'));
    expect(made).toHaveLength(1);
    expect(made[0]?.reason).toBe('migration');
    expect(made[0]?.name).toContain(all.at(-1)?.name);
    // It is the database before: fourteen migrations, not sixteen.
    const copy = openDatabase(path.join(config.vaultPath, '.skb', 'backups', made[0]?.name ?? ''), {
      readOnly: true,
    });
    expect(copy.get<{ n: number }>('SELECT count(*) AS n FROM _migrations')?.n).toBe(14);
    copy.close();
    const now = openDatabase(dbPath, { readOnly: true });
    expect(now.get<{ n: number }>('SELECT count(*) AS n FROM _migrations')?.n).toBe(all.length);
    now.close();
  });
});

describe('Settings → Data lists them', () => {
  it('lists backups and makes one on request', async () => {
    const harness = createTestApp();
    cleanups.push(() => harness.cleanup());
    const api = jsonApi(harness.request);
    expect((await api.get('/api/backups', BackupsSchema)).backups).toEqual([]);
    const made = await api.post<{ name: string; reason: string }>('/api/backups', undefined, 201);
    expect(made.reason).toBe('manual');
    const listed = await api.get('/api/backups', BackupsSchema);
    expect(listed.backups.map((backup) => backup.name)).toEqual([made.name]);
    expect(listed.folder).toBe(path.join(harness.ctx.vault.root, '.skb', 'backups'));
    expect(listed.keep).toEqual({ daily: 14, migration: 5, manual: 10 });
    mkdirSync(listed.folder, { recursive: true });
  });
});
