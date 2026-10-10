import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isConstraintError, openDatabase, type SqlDatabase, sqliteVersion } from './sqlite';

const open: SqlDatabase[] = [];
const dirs: string[] = [];

function memory(): SqlDatabase {
  const db = openDatabase(':memory:');
  open.push(db);
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, data BLOB)');
  return db;
}

afterEach(() => {
  for (const db of open.splice(0)) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('runs statements with positional and named parameters', () => {
    const db = memory();
    expect(db.run('INSERT INTO items (name) VALUES (?)', ['a'])).toEqual({
      changes: 1,
      lastInsertRowid: 1,
    });
    db.run('INSERT INTO items (name, data) VALUES (:name, :data)', {
      name: 'b',
      data: new Uint8Array([1, 2]),
    });
    expect(db.get<{ name: string }>('SELECT name FROM items WHERE id = ?', [1])?.name).toBe('a');
    const rows = db.all<{ name: string; data: Uint8Array | null }>(
      'SELECT name, data FROM items ORDER BY id',
    );
    expect(rows.map((row) => row.name)).toEqual(['a', 'b']);
    expect(Array.from(rows[1]?.data ?? [])).toEqual([1, 2]);
    expect(db.get('SELECT * FROM items WHERE id = 99')).toBeUndefined();
  });

  it('commits transactions and returns their result', () => {
    const db = memory();
    const id = db.transaction(
      () => db.run('INSERT INTO items (name) VALUES (?)', ['a']).lastInsertRowid,
    );
    expect(id).toBe(1);
    expect(db.inTransaction).toBe(false);
    expect(db.all('SELECT * FROM items')).toHaveLength(1);
  });

  it('rolls back a failed transaction completely', () => {
    const db = memory();
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO items (name) VALUES (?)', ['a']);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.inTransaction).toBe(false);
    expect(db.all('SELECT * FROM items')).toHaveLength(0);
  });

  it('rolls back only the inner savepoint when a nested transaction fails', () => {
    const db = memory();
    db.transaction(() => {
      db.run('INSERT INTO items (name) VALUES (?)', ['outer']);
      expect(() =>
        db.transaction(() => {
          db.run('INSERT INTO items (name) VALUES (?)', ['inner']);
          throw new Error('inner failure');
        }),
      ).toThrow('inner failure');
      db.run('INSERT INTO items (name) VALUES (?)', ['after']);
    });
    const names = db
      .all<{ name: string }>('SELECT name FROM items ORDER BY id')
      .map((row) => row.name);
    expect(names).toEqual(['outer', 'after']);
  });

  it('rejects asynchronous transaction callbacks and rolls back', () => {
    const db = memory();
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO items (name) VALUES (?)', ['a']);
        return Promise.resolve(1);
      }),
    ).toThrow(/must be synchronous/);
    expect(db.inTransaction).toBe(false);
    expect(db.all('SELECT * FROM items')).toHaveLength(0);
  });

  it('identifies constraint violations', () => {
    const db = memory();
    db.run('INSERT INTO items (name) VALUES (?)', ['a']);
    let caught: unknown;
    try {
      db.run('INSERT INTO items (name) VALUES (?)', ['a']);
    } catch (error) {
      caught = error;
    }
    expect(isConstraintError(caught)).toBe(true);
    expect(isConstraintError(new Error('other'))).toBe(false);
  });

  it('enforces foreign keys', () => {
    const db = memory();
    db.exec(
      'CREATE TABLE children (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id))',
    );
    expect(() => db.run('INSERT INTO children (item_id) VALUES (?)', [42])).toThrow();
  });

  it('supports FTS5 full-text search', () => {
    const db = memory();
    db.exec(
      "CREATE VIRTUAL TABLE docs USING fts5(body, tokenize = 'porter unicode61 remove_diacritics 2')",
    );
    db.run('INSERT INTO docs (body) VALUES (?)', ['Paxos guarantees safety under asynchrony']);
    db.run('INSERT INTO docs (body) VALUES (?)', ['Raft elects a leader']);
    const hits = db.all<{ body: string }>(
      'SELECT body FROM docs WHERE docs MATCH ? ORDER BY rank',
      ['guarantee'],
    );
    expect(hits.map((hit) => hit.body)).toEqual(['Paxos guarantees safety under asynchrony']);
  });

  it('uses WAL mode for file databases', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skb-sqlite-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 'test.db'));
    open.push(db);
    expect(db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode).toBe('wal');
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1);
    expect(sqliteVersion(db)).toMatch(/^3\.\d+\.\d+$/);
  });

  it('leaves the file whole on its own when it is closed (the write-ahead log is folded in)', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'skb-wal-'));
    try {
      const file = path.join(folder, 'wal.db');
      const db = openDatabase(file);
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL) STRICT');
      for (let n = 0; n < 50; n += 1) db.run('INSERT INTO t (v) VALUES (?)', [`row ${n}`]);
      db.close();
      expect(existsSync(`${file}-wal`)).toBe(false);
      const again = openDatabase(file, { readOnly: true });
      expect(again.get<{ n: number }>('SELECT count(*) AS n FROM t')?.n).toBe(50);
      again.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is safe to close twice', () => {
    const db = openDatabase(':memory:');
    db.close();
    expect(() => db.close()).not.toThrow();
  });
});
