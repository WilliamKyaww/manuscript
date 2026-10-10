import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, TEST_PORT, TEST_TOKEN } from '../../test/helpers';
import { sessionCookieName } from './guards';

/**
 * The whole API surface against the guards (Phase 17, task 17.04). Every route that is registered is
 * tried without credentials, with a wrong token, as a cross-site fetch, from a foreign origin and
 * under a foreign Host — so a route added later cannot forget to be behind them.
 */

let harness: ReturnType<typeof createTestApp> | undefined;
afterEach(() => {
  harness?.cleanup();
  harness = undefined;
});

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
/** The only API routes that may be reached without a token. */
const PUBLIC = ['GET /api/ping'];

function routes(app: ReturnType<typeof createTestApp>['app']) {
  const seen = new Map<string, { method: string; path: string }>();
  for (const route of app.routes) {
    // `/api/*` itself is the guard and the unknown-route fallback; file routes end in a wildcard.
    if (!route.path.startsWith('/api/') || route.path === '/api/*') continue;
    if (route.method === 'ALL') continue;
    seen.set(`${route.method} ${route.path}`, { method: route.method, path: route.path });
  }
  return [...seen.entries()].map(([key, value]) => ({ key, ...value }));
}

/** A concrete URL for a route with parameters (guards run before anything reads them). */
const concrete = (path: string) => path.replace(/:[A-Za-z]+/gu, 'x').replace(/\*/gu, 'x');

describe('the API surface', () => {
  it('has a large, known set of routes, and only the ping is public', () => {
    harness = createTestApp();
    const all = routes(harness.app);
    expect(all.length).toBeGreaterThan(150);
    const open = all.filter((route) => PUBLIC.includes(route.key)).map((route) => route.key);
    expect(open).toEqual(PUBLIC);
  });

  it('refuses every other route without a token, with a wrong one, and across sites', async () => {
    harness = createTestApp();
    const failures: string[] = [];
    for (const route of routes(harness.app)) {
      if (PUBLIC.includes(route.key)) continue;
      const url = concrete(route.path);
      const init = { method: route.method };
      const none = await harness.request(url, { ...init, auth: 'none' });
      if (none.status !== 401) failures.push(`${route.key}: no credentials gave ${none.status}`);
      const wrong = await harness.request(url, {
        ...init,
        auth: 'none',
        headers: { authorization: 'Bearer not-the-token' },
      });
      if (wrong.status !== 401) failures.push(`${route.key}: a wrong token gave ${wrong.status}`);
      const crossSite = await harness.request(url, {
        ...init,
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      if (crossSite.status !== 403)
        failures.push(`${route.key}: cross-site gave ${crossSite.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuses a state change that carries only a cookie from another origin, and a foreign Host', async () => {
    harness = createTestApp();
    const failures: string[] = [];
    const cookie = `${sessionCookieName(TEST_PORT)}=${TEST_TOKEN}`;
    for (const route of routes(harness.app)) {
      if (PUBLIC.includes(route.key)) continue;
      const url = concrete(route.path);
      if (!SAFE.has(route.method)) {
        const foreign = await harness.request(url, {
          method: route.method,
          auth: 'none',
          headers: { cookie, origin: 'http://evil.example' },
        });
        if (foreign.status !== 403)
          failures.push(`${route.key}: a foreign origin gave ${foreign.status}`);
        const noOrigin = await harness.request(url, {
          method: route.method,
          auth: 'none',
          headers: { cookie },
        });
        if (noOrigin.status !== 403)
          failures.push(`${route.key}: a cookie without an origin gave ${noOrigin.status}`);
      }
      const rebinding = await harness.request(url, {
        method: route.method,
        host: 'evil.example',
      });
      if (rebinding.status !== 403)
        failures.push(`${route.key}: a foreign Host gave ${rebinding.status}`);
    }
    expect(failures).toEqual([]);
  });
});
