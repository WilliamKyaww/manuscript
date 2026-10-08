import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HealthResponseSchema, PingResponseSchema, ProblemDetailsSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, TEST_PORT } from '../test/helpers';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup(options: Parameters<typeof createTestApp>[0] = {}) {
  const test = createTestApp(options);
  cleanups.push(test.cleanup);
  return test;
}

describe('app integration', () => {
  it('answers the public ping without credentials', async () => {
    const { request } = setup();
    const response = await request('/api/ping', { auth: 'none' });
    expect(response.status).toBe(200);
    expect(PingResponseSchema.parse(await response.json())).toEqual({
      app: 'manuscript',
      ok: true,
    });
  });

  it('protects the health endpoint', async () => {
    const { request } = setup();
    const response = await request('/api/health', { auth: 'none' });
    expect(response.status).toBe(401);
    const problem = ProblemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe('unauthenticated');
  });

  it('reports health with vault and database details', async () => {
    const { request, ctx, clock } = setup();
    clock.advance(90_000);
    const response = await request('/api/health', { auth: 'cookie' });
    expect(response.status).toBe(200);
    const health = HealthResponseSchema.parse(await response.json());
    expect(health.status).toBe('ok');
    expect(health.mode).toBe('test');
    expect(health.uptimeSeconds).toBe(90);
    expect(health.vault).toEqual({ id: ctx.vault.id, name: 'vault', path: ctx.vault.root });
    expect(health.database.ok).toBe(true);
    expect(health.database.appliedMigrations).toBeGreaterThanOrEqual(1);
    expect(health.database.latestMigration).toMatch(/^\d{4}_/);
    expect(health.database.sqliteVersion).toMatch(/^3\./);
  });

  it('adds security headers to successful and error responses', async () => {
    const { request } = setup();
    for (const response of [
      await request('/api/health'),
      await request('/api/health', { auth: 'none' }),
    ]) {
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });

  it('rejects foreign Host headers before routing', async () => {
    const { request } = setup();
    expect((await request('/api/ping', { auth: 'none', host: 'attacker.example' })).status).toBe(
      403,
    );
  });

  it('returns problem details for unknown API routes', async () => {
    const { request } = setup();
    const response = await request('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(ProblemDetailsSchema.parse(await response.json()).code).toBe('not_found');
  });

  it('serves the SPA when a web directory is configured', async () => {
    const webDir = mkdtempSync(path.join(tmpdir(), 'skb-app-web-'));
    cleanups.push(() => rmSync(webDir, { recursive: true, force: true }));
    mkdirSync(path.join(webDir, 'assets'));
    writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>SKB</title>');
    const { request } = setup({ config: { webDir } });
    const page = await request('/modules/COC251', { auth: 'none' });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>SKB</title>');
    // API paths never fall through to the SPA.
    expect((await request('/api/nope')).status).toBe(404);
  });

  it('completes the sign-in flow and then authorises with the cookie', async () => {
    const { request } = setup();
    const signIn = await request(`/auth?token=test-token-0123456789-abcdefghijklmnopqrstuvwxyz`, {
      auth: 'none',
    });
    expect(signIn.status).toBe(303);
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(cookie.startsWith(`skb_session_${TEST_PORT}=`)).toBe(true);
    const health = await request('/api/health', { auth: 'none', headers: { cookie } });
    expect(health.status).toBe(200);
  });
});
