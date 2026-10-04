import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staticSite } from './static';

let webDir: string;
let app: Hono;

beforeAll(() => {
  webDir = mkdtempSync(path.join(tmpdir(), 'skb-web-'));
  mkdirSync(path.join(webDir, 'assets'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(webDir, 'favicon.svg'), '<svg/>');
  app = new Hono();
  app.use('*', staticSite(webDir));
  app.all('/api/*', (c) => c.json({ api: true }, 404));
  app.notFound((c) => c.text('not found', 404));
});

afterAll(() => rmSync(webDir, { recursive: true, force: true }));

describe('staticSite', () => {
  it('serves index.html at the root without long-term caching', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('id="root"');
  });

  it('serves hashed assets as immutable', async () => {
    const response = await app.request('/assets/app-abc123.js');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('serves other files with revalidation', async () => {
    const response = await app.request('/favicon.svg');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('falls back to index.html for client-side routes', async () => {
    const response = await app.request('/notes/note_01ABC');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
  });

  it('returns 404 for missing files and never serves the SPA for API paths', async () => {
    expect((await app.request('/missing.png')).status).toBe(404);
    const api = await app.request('/api/whatever');
    expect(await api.json()).toEqual({ api: true });
  });

  it('cannot be used to read files outside the web directory', async () => {
    for (const attempt of [
      '/..%2f..%2fsecret.txt',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/..%5c..%5cx.js',
    ]) {
      const response = await app.request(attempt);
      const text = await response.text();
      expect(text).not.toContain('secret');
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) expect(text).toContain('id="root"');
    }
  });

  it('answers HEAD requests without a body', async () => {
    const response = await app.request('/', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
