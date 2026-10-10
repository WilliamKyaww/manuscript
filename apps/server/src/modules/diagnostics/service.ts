import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Diagnostics, LogEntry } from '@skb/core';
import { strToU8, zipSync } from 'fflate';
import type { AppContext } from '../../context';
import { sqliteVersion } from '../../db/sqlite';
import { listLogFiles } from '../../shared/log-file';
import { redact } from '../../shared/logger';
import type { BackupService } from '../backup/service';

/**
 * What is going on inside the application, for the Diagnostics page and for a bundle that can be
 * handed to someone who is helping (task 17.06). Counts and states only: no note text, no keys.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const READ_LIMIT_BYTES = 8 * 1024 * 1024;

export interface DiagnosticsDependencies {
  ctx: AppContext;
  backups: BackupService;
}

export type DiagnosticsService = ReturnType<typeof createDiagnosticsService>;

/** Replaces the home folder with `~` in every string, so a bundle does not carry the user name. */
export function maskHome<T>(value: T, home = os.homedir()): T {
  const variants = [home, home.replaceAll('\\', '/')].filter((entry) => entry.length > 3);
  const mask = (text: string) => variants.reduce((out, entry) => out.split(entry).join('~'), text);
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') return mask(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
    return item;
  };
  return walk(value) as T;
}

export function createDiagnosticsService({ ctx, backups }: DiagnosticsDependencies) {
  const { db, vault } = ctx;
  const count = (table: string, where = '') =>
    db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table} ${where}`)?.n ?? 0;
  const size = (file: string) => (existsSync(file) ? statSync(file).size : 0);

  function report(): Diagnostics {
    const migrations = db.get<{ n: number; latest: string | null }>(
      'SELECT count(*) AS n, max(name) AS latest FROM _migrations',
    );
    const jobStatus = new Map(
      db
        .all<{ status: string; n: number }>(
          'SELECT status, count(*) AS n FROM jobs GROUP BY status',
        )
        .map((row) => [row.status, row.n]),
    );
    const made = backups.list().backups;
    return {
      app: {
        version: ctx.version,
        mode: ctx.config.mode,
        startedAt: ctx.startedAt.toISOString(),
        uptimeSeconds: Math.max(
          0,
          Math.round((ctx.clock.now().getTime() - ctx.startedAt.getTime()) / 1000),
        ),
        node: process.versions.node,
        platform: `${process.platform} ${process.arch}`,
      },
      vault: { name: vault.name, path: vault.root },
      database: {
        sqliteVersion: sqliteVersion(db),
        migrations: migrations?.n ?? 0,
        latestMigration: migrations?.latest ?? null,
        sizeBytes: size(vault.paths.database),
        walBytes: size(`${vault.paths.database}-wal`),
      },
      counts: {
        notes: count('notes'),
        sources: count('sources', 'WHERE deleted_at IS NULL'),
        concepts: count('concepts', "WHERE status = 'active'"),
        cards: count('cards'),
        questions: count('questions'),
      },
      jobs: {
        queued: jobStatus.get('queued') ?? 0,
        running: jobStatus.get('running') ?? 0,
        failed: jobStatus.get('failed') ?? 0,
        recentFailures: db
          .all<{ kind: string; error: string | null; updated_at: string }>(
            `SELECT kind, error, updated_at FROM jobs WHERE status = 'failed'
             ORDER BY updated_at DESC LIMIT 5`,
          )
          .map((row) => ({
            kind: row.kind,
            error: (row.error ?? 'No reason was recorded.').slice(0, 300),
            updatedAt: row.updated_at,
          })),
      },
      backups: { count: made.length, latestAt: made[0]?.createdAt ?? null },
      logs: { folder: vault.paths.logs, files: listLogFiles(vault.paths.logs) },
    };
  }

  /** The newest entries at or above `level`, newest first. */
  function logs(options: { level: Level; q?: string | undefined; limit: number }): {
    entries: LogEntry[];
    truncated: boolean;
  } {
    const wanted = LEVELS[options.level];
    const needle = options.q?.toLowerCase();
    const entries: LogEntry[] = [];
    let truncated = false;
    const files = listLogFiles(vault.paths.logs).reverse();
    outer: for (const file of files) {
      const text = readFileSync(path.join(vault.paths.logs, file.name), 'utf8');
      const lines = text.split('\n');
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const level = String(parsed.level) as Level;
        if ((LEVELS[level] ?? 0) < wanted) continue;
        const { time, level: _level, msg, ...fields } = parsed;
        const entry: LogEntry = {
          time: String(time),
          level,
          message: String(msg),
          fields: redact(fields) as Record<string, unknown>,
        };
        if (
          needle &&
          !`${entry.message} ${JSON.stringify(entry.fields)}`.toLowerCase().includes(needle)
        )
          continue;
        if (entries.length >= options.limit) {
          truncated = true;
          break outer;
        }
        entries.push(entry);
      }
    }
    return { entries, truncated };
  }

  /** A zip with the report, the non-secret settings, the applied migrations and the log. */
  function bundle(): { name: string; bytes: Uint8Array } {
    const at = ctx.clock.now();
    const stamp = at.toISOString().replace(/[:T]/gu, '-').slice(0, 19);
    const files: Record<string, Uint8Array> = {};
    const json = (value: unknown) => strToU8(`${JSON.stringify(maskHome(value), null, 2)}\n`);

    files['README.txt'] = strToU8(
      [
        'Manuscript diagnostics',
        `Made ${at.toISOString()} by Manuscript ${ctx.version}.`,
        '',
        'This holds the state of the application — versions, counts, the background jobs, the',
        'migrations applied, non-secret settings and the recent log. It holds no note text, no',
        'questions or answers, and no AI keys; your home folder is shown as "~".',
        'Read it before you send it to anyone.',
        '',
      ].join('\n'),
    );
    files['report.json'] = json({
      ...report(),
      versions: {
        node: process.versions.node,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
      },
      environment: Object.keys(process.env)
        .filter((name) => name.startsWith('SKB_'))
        .sort(),
      migrations: db.all('SELECT name, applied_at FROM _migrations ORDER BY name'),
      settings: db
        .all<{ key: string; value_json: string }>(
          'SELECT key, value_json FROM settings ORDER BY key',
        )
        .map((row) => ({ key: row.key, value: safeJson(row.value_json) })),
    });
    for (const file of listLogFiles(vault.paths.logs)) {
      const raw = readFileSync(path.join(vault.paths.logs, file.name), 'utf8').slice(
        -READ_LIMIT_BYTES,
      );
      const cleaned = raw
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => {
          try {
            return JSON.stringify(maskHome(redact(JSON.parse(line))));
          } catch {
            return '';
          }
        })
        .filter((line) => line !== '');
      files[`logs/${file.name}`] = strToU8(`${cleaned.join('\n')}\n`);
    }
    return { name: `manuscript-diagnostics-${stamp}.zip`, bytes: zipSync(files, { level: 6 }) };
  }

  return { report, logs, bundle };
}

function safeJson(text: string): unknown {
  try {
    return redact(JSON.parse(text));
  } catch {
    return null;
  }
}
