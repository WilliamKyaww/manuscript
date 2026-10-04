import { defineEndpoint, healthEndpoint } from '@skb/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient } from './client';

const health = {
  status: 'ok',
  version: '0.1.0',
  mode: 'test',
  startedAt: '2026-10-04T12:00:00.000Z',
  uptimeSeconds: 5,
  vault: { id: 'vault_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', name: 'Vault', path: 'C:/Vault' },
  database: {
    ok: true,
    sqliteVersion: '3.51.2',
    appliedMigrations: 1,
    latestMigration: '0001_init',
  },
};

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });

describe('api client', () => {
  it('requests the endpoint path with same-origin credentials and validates the response', async () => {
    const fetch = vi.fn(async () => json(health));
    const client = createApiClient({ fetch });
    const result = await client.request(healthEndpoint);
    expect(result.vault.name).toBe('Vault');
    expect(fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('builds paths, query strings and JSON bodies from the contract', async () => {
    const endpoint = defineEndpoint({
      method: 'PUT',
      path: '/api/things/:id',
      params: z.object({ id: z.string() }),
      query: z.object({ mode: z.string() }),
      body: z.object({ title: z.string() }),
      response: z.object({ ok: z.boolean() }),
    });
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json({ ok: true }));
    const client = createApiClient({ fetch, baseUrl: 'http://127.0.0.1:4317' });
    await client.request(endpoint, {
      params: { id: 'a b' },
      query: { mode: 'fast' },
      body: { title: 'T' },
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:4317/api/things/a%20b?mode=fast');
    expect(init?.body).toBe('{"title":"T"}');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');
  });

  it('turns problem details into ApiErrors', async () => {
    const problem = {
      type: 'urn:skb:problem:unauthenticated',
      title: 'Authentication required',
      status: 401,
      detail: 'Not signed in.',
      code: 'unauthenticated',
    };
    const client = createApiClient({
      fetch: async () => json(problem, 401, 'application/problem+json'),
    });
    const error = await client.request(healthEndpoint).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnauthenticated).toBe(true);
    expect((error as ApiError).code).toBe('unauthenticated');
    expect((error as ApiError).message).toBe('Not signed in.');
  });

  it('reports an unreachable server distinctly', async () => {
    const client = createApiClient({
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const error = (await client
      .request(healthEndpoint)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.status).toBe(0);
    expect(error.code).toBe('unreachable');
  });

  it('rejects responses that do not match the contract', async () => {
    const client = createApiClient({ fetch: async () => json({ status: 'ok' }) });
    await expect(client.request(healthEndpoint)).rejects.toThrow(/unexpected response/);
  });

  it('copes with non-JSON error bodies', async () => {
    const client = createApiClient({
      fetch: async () => new Response('Bad gateway', { status: 502 }),
    });
    const error = (await client
      .request(healthEndpoint)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.problem).toBeNull();
    expect(error.code).toBe('http_502');
  });
});
