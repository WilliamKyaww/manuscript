import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HealthResponseSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config/config';
import { type RunningServer, StartupError, startServer } from './server';
import { silentLogger } from './shared/logger';

const TOKEN = 'server-test-token-0123456789-abcdefghijklmnop';
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const root = mkdtempSync(path.join(tmpdir(), 'skb-server-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return {
    mode: 'test',
    host: '127.0.0.1',
    port: 0,
    vaultPath: path.join(root, 'vault'),
    dataDir: path.join(root, 'data'),
    webDir: null,
    logLevel: 'error',
    openBrowser: false,
    devWebOrigin: null,
    authTokenOverride: TOKEN,
    ...overrides,
  };
}

async function start(overrides: Partial<ServerConfig> = {}): Promise<RunningServer> {
  const running = await startServer(config(overrides), { logger: silentLogger });
  cleanups.push(() => running.close());
  return running;
}

describe('startServer', () => {
  it('listens on loopback and serves authenticated health over real HTTP', async () => {
    const running = await start();
    expect(running.origin).toBe(`http://127.0.0.1:${running.port}`);
    expect(running.bootstrapUrl).toBe(`${running.origin}/auth?token=${TOKEN}`);

    const ping = await fetch(`${running.origin}/api/ping`);
    expect(ping.status).toBe(200);

    const unauthorised = await fetch(`${running.origin}/api/health`);
    expect(unauthorised.status).toBe(401);

    const health = await fetch(`${running.origin}/api/health`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(HealthResponseSchema.parse(await health.json()).database.ok).toBe(true);
  });

  it('uses the Vite origin for the sign-in link in development', async () => {
    const running = await start({ mode: 'development', devWebOrigin: 'http://127.0.0.1:5173' });
    expect(running.bootstrapUrl).toBe(`http://127.0.0.1:5173/auth?token=${TOKEN}`);
  });

  it('releases the vault lock and database on close so the vault can be reopened', async () => {
    const shared = config();
    const first = await startServer(shared, { logger: silentLogger });
    await first.close();
    await first.close(); // idempotent
    const second = await startServer(shared, { logger: silentLogger });
    cleanups.push(() => second.close());
    expect(second.context.vault.id).toBe(first.context.vault.id);
  });

  it('explains when the port is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
    cleanups.push(() => new Promise<void>((resolve) => blocker.close(() => resolve())));
    const port = (blocker.address() as { port: number }).port;
    await expect(startServer(config({ port }), { logger: silentLogger })).rejects.toThrow(
      StartupError,
    );
    await expect(startServer(config({ port }), { logger: silentLogger })).rejects.toThrow(
      /already in use/,
    );
  });
});
