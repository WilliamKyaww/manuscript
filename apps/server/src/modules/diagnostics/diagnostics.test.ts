import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DiagnosticsSchema, LogEntrySchema } from '@skb/core';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { createTestApp } from '../../../test/helpers';
import { createDeferredLogFile, listLogFiles } from '../../shared/log-file';
import { createLogger } from '../../shared/logger';
import { maskHome } from './service';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const temp = () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-diag-'));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
};

describe('the log file', () => {
  it('holds lines until the vault is open, then one JSON line per entry, redacted', () => {
    const folder = path.join(temp(), 'logs');
    const file = createDeferredLogFile(() => new Date('2026-10-10T10:00:00Z'));
    const logger = createLogger({
      level: 'info',
      format: 'pretty',
      write: () => {},
      file: (line) => file.write(line),
      now: () => new Date('2026-10-10T10:00:00Z'),
    });
    logger.info('Before the vault', { n: 1 });
    expect(listLogFiles(folder)).toEqual([]);
    file.attach(folder);
    logger.warn('After the vault', { apiKey: 'sk-secret', where: 'here' });
    logger.debug('Below the level');

    const lines = readFileSync(path.join(folder, 'manuscript-2026-10-10.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.map((line) => line.msg)).toEqual(['Before the vault', 'After the vault']);
    expect(lines[1]).toMatchObject({ level: 'warn', apiKey: '[redacted]', where: 'here' });
    expect(JSON.stringify(lines)).not.toContain('sk-secret');
  });

  it('moves a full day aside, and removes files older than a week', () => {
    const folder = temp();
    let day = '2026-10-10T10:00:00Z';
    const file = createDeferredLogFile(() => new Date(day), 200);
    // An old file and a recent one are already there.
    writeFileSync(path.join(folder, 'manuscript-2026-09-20.log'), '{}\n');
    writeFileSync(path.join(folder, 'manuscript-2026-10-08.log'), '{}\n');
    file.attach(folder);
    for (let n = 0; n < 8; n += 1) file.write(JSON.stringify({ n, pad: 'x'.repeat(60) }));
    const names = listLogFiles(folder).map((entry) => entry.name);
    expect(names).toContain('manuscript-2026-10-10.old.log');
    expect(names).toContain('manuscript-2026-10-10.log');
    expect(names).toContain('manuscript-2026-10-08.log');
    expect(names).not.toContain('manuscript-2026-09-20.log');
    day = '2026-10-11T10:00:00Z';
    file.write('{}');
    expect(readdirSync(folder)).toContain('manuscript-2026-10-11.log');
  });
});

describe('Diagnostics', () => {
  it('reports the state of the installation, reads the log and makes a bundle without secrets', async () => {
    const harness = createTestApp();
    cleanups.push(() => harness.cleanup());
    const api = jsonApi(harness.request);
    const logs = harness.ctx.vault.paths.logs;
    mkdirSync(logs, { recursive: true });
    const entry = (level: string, msg: string, fields: Record<string, unknown> = {}) =>
      JSON.stringify({ time: '2026-10-10T09:00:00.000Z', level, msg, ...fields });
    appendFileSync(
      path.join(logs, 'manuscript-2026-10-10.log'),
      [
        entry('info', 'Started', {
          vault: path.join(process.env.USERPROFILE ?? 'C:\\Users\\will', 'Vault'),
        }),
        entry('warn', 'The daily backup failed', { error: { message: 'disk full' }, token: 'abc' }),
        entry('error', 'Indexing the vault failed', { path: 'Notes/a.md' }),
        entry('debug', 'Chatty'),
        'not json at all',
      ].join('\n'),
    );
    harness.ctx.db.run(
      "INSERT INTO jobs (id, kind, payload_json, status, run_after, created_at, updated_at, error) VALUES ('job_01J9Z3K4M2Q8R5T7V9X1Y3Z5A1', 'source.ingest', '{}', 'failed', '2026-10-10T09:00:00Z', '2026-10-10T09:00:00Z', '2026-10-10T09:00:00Z', 'The PDF is encrypted.')",
    );

    const report = await api.get('/api/diagnostics', DiagnosticsSchema);
    expect(report.app.version).toBe('0.1.0-test');
    expect(report.database.migrations).toBeGreaterThanOrEqual(16);
    expect(report.jobs).toMatchObject({ failed: 1 });
    expect(report.jobs.recentFailures[0]).toMatchObject({
      kind: 'source.ingest',
      error: 'The PDF is encrypted.',
    });
    expect(report.logs.files.map((file) => file.name)).toEqual(['manuscript-2026-10-10.log']);

    const warnings = await api.get(
      '/api/diagnostics/logs?level=warn',
      z.object({ entries: z.array(LogEntrySchema), truncated: z.boolean() }),
    );
    expect(warnings.entries.map((item) => item.message)).toEqual([
      'Indexing the vault failed',
      'The daily backup failed',
    ]);
    expect(JSON.stringify(warnings.entries)).not.toContain('abc');
    const searched = await api.get<{ entries: { message: string }[] }>(
      '/api/diagnostics/logs?level=debug&q=disk',
    );
    expect(searched.entries.map((item) => item.message)).toEqual(['The daily backup failed']);

    // The bundle: a zip with the report and the log, nothing secret, the home folder masked.
    const response = await harness.request('/api/diagnostics/bundle');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'logs/manuscript-2026-10-10.log',
      'report.json',
    ]);
    const text = (name: string) => new TextDecoder().decode(files[name]);
    const bundleText = Object.keys(files).map(text).join('\n');
    expect(bundleText).not.toContain('"abc"');
    expect(text('logs/manuscript-2026-10-10.log')).toContain('"token":"[redacted]"');
    const parsed = JSON.parse(text('report.json')) as {
      migrations: unknown[];
      settings: unknown[];
    };
    expect(parsed.migrations.length).toBeGreaterThanOrEqual(16);
    expect(Array.isArray(parsed.settings)).toBe(true);
  });

  it('shows the home folder as ~', () => {
    expect(
      maskHome({ a: ['C:\\Users\\will\\Vault', 'C:/Users/will/Vault/x'] }, 'C:\\Users\\will'),
    ).toEqual({
      a: ['~\\Vault', '~/Vault/x'],
    });
    utimesSync(temp(), new Date(), new Date());
  });
});
