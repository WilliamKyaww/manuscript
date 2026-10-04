import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIdFactory } from '@skb/core';
import { createApp } from '../src/app';
import type { ServerConfig } from '../src/config/config';
import type { AppContext } from '../src/context';
import { loadMigrations, migrate } from '../src/db/migrate';
import { openDatabase } from '../src/db/sqlite';
import { sessionCookieName } from '../src/security/guards';
import { FixedClock } from '../src/shared/clock';
import { silentLogger } from '../src/shared/logger';
import { openVault } from '../src/vault/vault';

export const TEST_TOKEN = 'test-token-0123456789-abcdefghijklmnopqrstuvwxyz';
export const TEST_PORT = 4317;
export const TEST_HOST = `127.0.0.1:${TEST_PORT}`;
export const TEST_ORIGIN = `http://${TEST_HOST}`;

export interface TestContextOptions {
  config?: Partial<ServerConfig>;
  clock?: FixedClock;
}

export interface TestContext {
  ctx: AppContext;
  clock: FixedClock;
  root: string;
  cleanup(): void;
}

/** A fully wired context on a temporary vault and data directory. Call `cleanup()` afterwards. */
export function createTestContext(options: TestContextOptions = {}): TestContext {
  const root = mkdtempSync(path.join(tmpdir(), 'skb-test-'));
  const clock = options.clock ?? new FixedClock('2026-10-04T12:00:00.000Z');
  const config: ServerConfig = {
    mode: 'test',
    host: '127.0.0.1',
    port: TEST_PORT,
    vaultPath: path.join(root, 'vault'),
    dataDir: path.join(root, 'data'),
    webDir: null,
    logLevel: 'error',
    openBrowser: false,
    devWebOrigin: null,
    authTokenOverride: TEST_TOKEN,
    ...options.config,
  };
  const ids = createIdFactory({ now: () => clock.now().getTime() });
  const vault = openVault(config.vaultPath, { create: true, clock, ids, appVersion: '0.1.0-test' });
  const db = openDatabase(vault.paths.database);
  migrate(db, loadMigrations(), clock);
  const ctx: AppContext = {
    config,
    logger: silentLogger,
    clock,
    ids,
    vault,
    db,
    version: '0.1.0-test',
    startedAt: clock.now(),
  };
  return {
    ctx,
    clock,
    root,
    cleanup() {
      db.close();
      vault.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export interface RequestOptions extends RequestInit {
  auth?: 'cookie' | 'bearer' | 'none';
  host?: string;
}

/** Creates the app on a test context and a request helper that adds Host and credentials. */
export function createTestApp(options: TestContextOptions = {}) {
  const test = createTestContext(options);
  const { app } = createApp(test.ctx, { token: TEST_TOKEN, getPort: () => test.ctx.config.port });
  const request = (pathname: string, init: RequestOptions = {}) => {
    const { auth = 'bearer', host = TEST_HOST, headers, ...rest } = init;
    const merged = new Headers(headers);
    merged.set('host', host);
    if (auth === 'bearer') merged.set('authorization', `Bearer ${TEST_TOKEN}`);
    if (auth === 'cookie') merged.set('cookie', `${sessionCookieName(TEST_PORT)}=${TEST_TOKEN}`);
    return app.request(pathname, { ...rest, headers: merged });
  };
  return { ...test, app, request };
}
