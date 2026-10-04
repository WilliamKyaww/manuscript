import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../http/problem';
import { silentLogger } from '../shared/logger';
import {
  allowedHosts,
  allowedOrigins,
  apiGuard,
  authBootstrapHandler,
  hostGuard,
  type SecurityContext,
  safeRedirectPath,
  sessionCookieName,
} from './guards';

const TOKEN = 'guard-test-token-0123456789-abcdefghijklmnop';
const PORT = 4400;

function makeApp(devWebOrigin: string | null = null) {
  const security: SecurityContext = {
    token: TOKEN,
    getPort: () => PORT,
    devWebOrigin,
    publicApiRoutes: new Set(['GET /api/ping']),
  };
  const app = new Hono();
  app.onError(errorHandler(silentLogger));
  app.use('*', hostGuard(security));
  app.get('/auth', authBootstrapHandler(security));
  app.use('/api/*', apiGuard(security));
  app.get('/api/ping', (c) => c.json({ ok: true }));
  app.get('/api/secret', (c) => c.json({ secret: true }));
  app.post('/api/change', (c) => c.json({ changed: true }));
  return app;
}

const cookie = `${sessionCookieName(PORT)}=${TOKEN}`;
const host = `127.0.0.1:${PORT}`;

function req(
  app: Hono,
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
) {
  return app.request(path, { ...init, headers: { host, ...init.headers } });
}

describe('host guard', () => {
  it('accepts loopback hosts on the bound port', async () => {
    const app = makeApp();
    for (const value of [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]) {
      const response = await app.request('/api/ping', { headers: { host: value } });
      expect(response.status).toBe(200);
    }
  });

  it('rejects other hosts (DNS rebinding) and a missing Host header', async () => {
    const app = makeApp();
    expect(
      (await app.request('/api/ping', { headers: { host: `evil.example:${PORT}` } })).status,
    ).toBe(403);
    expect((await app.request('/api/ping', { headers: { host: '127.0.0.1:9999' } })).status).toBe(
      403,
    );
    expect((await app.request('/api/ping')).status).toBe(403);
  });

  it('allows the development web server only when configured', () => {
    const security = { token: TOKEN, getPort: () => PORT, publicApiRoutes: new Set<string>() };
    expect(allowedHosts({ ...security, devWebOrigin: null }).has('127.0.0.1:5173')).toBe(false);
    expect(
      allowedHosts({ ...security, devWebOrigin: 'http://127.0.0.1:5173' }).has('localhost:5173'),
    ).toBe(true);
    expect(
      allowedOrigins({ ...security, devWebOrigin: 'http://127.0.0.1:5173' }).has(
        'http://127.0.0.1:5173',
      ),
    ).toBe(true);
  });
});

describe('api guard', () => {
  it('lets public routes through without credentials', async () => {
    expect((await req(makeApp(), '/api/ping')).status).toBe(200);
  });

  it('requires a session cookie or bearer token', async () => {
    const app = makeApp();
    const anonymous = await req(app, '/api/secret');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toContain('application/problem+json');
    expect((await req(app, '/api/secret', { headers: { cookie } })).status).toBe(200);
    expect(
      (await req(app, '/api/secret', { headers: { authorization: `Bearer ${TOKEN}` } })).status,
    ).toBe(200);
    expect(
      (await req(app, '/api/secret', { headers: { authorization: 'Bearer wrong' } })).status,
    ).toBe(401);
    expect(
      (await req(app, '/api/secret', { headers: { cookie: `${sessionCookieName(PORT)}=wrong` } }))
        .status,
    ).toBe(401);
    // A cookie for another instance's port is not accepted.
    expect(
      (
        await req(app, '/api/secret', {
          headers: { cookie: `${sessionCookieName(4317)}=${TOKEN}` },
        })
      ).status,
    ).toBe(401);
  });

  it('rejects cross-site fetches even with valid credentials', async () => {
    const response = await req(makeApp(), '/api/secret', {
      headers: { cookie, 'sec-fetch-site': 'cross-site' },
    });
    expect(response.status).toBe(403);
  });

  it('requires an allowed Origin for cookie-authenticated state changes', async () => {
    const app = makeApp();
    expect((await req(app, '/api/change', { method: 'POST', headers: { cookie } })).status).toBe(
      403,
    );
    expect(
      (
        await req(app, '/api/change', {
          method: 'POST',
          headers: { cookie, origin: 'http://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req(app, '/api/change', {
          method: 'POST',
          headers: { cookie, origin: `http://127.0.0.1:${PORT}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req(app, '/api/change', {
          method: 'POST',
          headers: { cookie, 'sec-fetch-site': 'same-origin' },
        })
      ).status,
    ).toBe(200);
  });

  it('does not require an Origin for bearer-authenticated clients', async () => {
    const response = await req(makeApp(), '/api/change', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(200);
  });
});

describe('auth bootstrap', () => {
  it('sets a strict HttpOnly session cookie and redirects', async () => {
    const response = await req(makeApp(), `/auth?token=${TOKEN}`);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${sessionCookieName(PORT)}=${TOKEN}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
  });

  it('honours a safe next path only', async () => {
    const app = makeApp();
    expect((await req(app, `/auth?token=${TOKEN}&next=/notes/a`)).headers.get('location')).toBe(
      '/notes/a',
    );
    expect(
      (await req(app, `/auth?token=${TOKEN}&next=//evil.example`)).headers.get('location'),
    ).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('/\\evil.example')).toBe('/');
  });

  it('rejects wrong tokens without setting a cookie', async () => {
    const response = await req(makeApp(), '/auth?token=wrong');
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('not valid');
  });

  it('rejects cross-site bootstrap attempts', async () => {
    const response = await req(makeApp(), `/auth?token=${TOKEN}`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(response.status).toBe(403);
  });
});
