import { createRequire } from 'node:module';
import type { StatementSync } from 'node:sqlite';
import { installSqliteWarningFilter } from './sqlite-warning';

/**
 * Thin adapter over Node's built-in `node:sqlite` (ADR-0006). All database access goes through
 * `SqlDatabase`, so the driver can be swapped (e.g. for better-sqlite3) without touching repositories.
 */

installSqliteWarningFilter();
const nodeRequire = createRequire(import.meta.url);
// Loaded with require *after* the warning filter is installed: a static import would emit the
// experimental warning before any of our code runs.
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type SqlValue = null | number | bigint | string | Uint8Array;
export type SqlParams = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;
export type Row = Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface SqlDatabase {
  /** File path, or `:memory:`. */
  readonly path: string;
  readonly inTransaction: boolean;
  /** Executes one or more statements without parameters (DDL, migrations). */
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): RunResult;
  get<T = Row>(sql: string, params?: SqlParams): T | undefined;
  all<T = Row>(sql: string, params?: SqlParams): T[];
  /**
   * Runs `fn` atomically. Nested calls use savepoints, so inner failures roll back only their own
   * work. `fn` must be synchronous: SQLite transactions must not span awaits.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface OpenDatabaseOptions {
  readOnly?: boolean;
  /** Milliseconds to wait for a locked database before failing. */
  busyTimeoutMs?: number;
}

const STATEMENT_CACHE_SIZE = 256;

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): SqlDatabase {
  const db = new DatabaseSync(path, {
    readOnly: options.readOnly ?? false,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
  });

  db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000))}`);
  if (!options.readOnly) {
    // WAL gives crash safety and concurrent readers; NORMAL sync is durable in WAL mode.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA foreign_keys = ON');

  const cache = new Map<string, StatementSync>();
  let depth = 0;
  let closed = false;

  const statement = (sql: string): StatementSync => {
    const cached = cache.get(sql);
    if (cached) {
      // Refresh recency for a simple LRU.
      cache.delete(sql);
      cache.set(sql, cached);
      return cached;
    }
    const prepared = db.prepare(sql);
    cache.set(sql, prepared);
    if (cache.size > STATEMENT_CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return prepared;
  };

  return {
    path,
    get inTransaction() {
      return db.isTransaction;
    },
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      const result = invoke(statement(sql), 'run', params);
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    get<T>(sql: string, params?: SqlParams) {
      return invoke(statement(sql), 'get', params) as T | undefined;
    },
    all<T>(sql: string, params?: SqlParams) {
      return invoke(statement(sql), 'all', params) as T[];
    },
    transaction<T>(fn: () => T): T {
      const savepoint = `skb_sp_${depth}`;
      db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
      depth += 1;
      try {
        const result = fn();
        if (isThenable(result)) {
          result.then(undefined, () => {});
          throw new Error('SqlDatabase.transaction callbacks must be synchronous.');
        }
        depth -= 1;
        if (depth === 0) {
          db.exec('COMMIT');
        } else {
          db.exec(`RELEASE ${savepoint}`);
        }
        return result;
      } catch (error) {
        if (depth > 0 && db.isTransaction) {
          depth -= 1;
          if (depth === 0) {
            db.exec('ROLLBACK');
          } else {
            db.exec(`ROLLBACK TO ${savepoint}`);
            db.exec(`RELEASE ${savepoint}`);
          }
        } else if (db.isTransaction && depth === 0) {
          // COMMIT itself failed (e.g. busy): make sure nothing is left half-open.
          db.exec('ROLLBACK');
        }
        throw error;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      cache.clear();
      db.close();
    },
  };
}

type StatementMethod = 'run' | 'get' | 'all';

/** Calls a statement method with positional or named parameters (the driver's two calling styles). */
function invoke<M extends StatementMethod>(
  statement: StatementSync,
  method: M,
  params: SqlParams | undefined,
): ReturnType<StatementSync[M]> {
  const fn = statement[method].bind(statement) as (
    ...args: unknown[]
  ) => ReturnType<StatementSync[M]>;
  if (params === undefined) return fn();
  if (Array.isArray(params)) return fn(...params);
  return fn(params as Readonly<Record<string, SqlValue>>);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** SQLite primary result code (low byte of the extended code), if the error came from SQLite. */
export function sqliteErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, errcode } = error as { code?: unknown; errcode?: unknown };
  if (code !== 'ERR_SQLITE_ERROR' || typeof errcode !== 'number') return undefined;
  return errcode & 0xff;
}

const SQLITE_CONSTRAINT = 19;

export function isConstraintError(error: unknown): boolean {
  return sqliteErrorCode(error) === SQLITE_CONSTRAINT;
}

/** SQLite library version string, e.g. "3.51.2". */
export function sqliteVersion(db: SqlDatabase): string {
  return db.get<{ version: string }>('SELECT sqlite_version() AS version')?.version ?? 'unknown';
}
