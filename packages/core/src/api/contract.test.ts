import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  buildPath,
  buildQuery,
  defineEndpoint,
  type EndpointInput,
  type EndpointOutput,
} from './contract';
import { healthEndpoint, pingEndpoint } from './system';

describe('api contract', () => {
  it('defaults to authenticated endpoints', () => {
    expect(healthEndpoint.auth).toBe('required');
    expect(pingEndpoint.auth).toBe('none');
    expect(healthEndpoint.schemas.response).toBeDefined();
  });

  it('builds paths with encoded parameters', () => {
    expect(buildPath('/api/notes/:id', { id: 'note_1' })).toBe('/api/notes/note_1');
    expect(buildPath('/api/files/:name', { name: 'a b/c' })).toBe('/api/files/a%20b%2Fc');
    expect(() => buildPath('/api/notes/:id', {})).toThrow(/Missing path parameter "id"/);
  });

  it('builds query strings, skipping empty values and repeating arrays', () => {
    expect(buildQuery(undefined)).toBe('');
    expect(buildQuery({ q: 'paxos raft', limit: 10, skip: undefined })).toBe(
      '?q=paxos+raft&limit=10',
    );
    expect(buildQuery({ tag: ['a', 'b'] })).toBe('?tag=a&tag=b');
  });

  it('infers input and output types from schemas', () => {
    const endpoint = defineEndpoint({
      method: 'PUT',
      path: '/api/things/:id',
      params: z.object({ id: z.string() }),
      body: z.object({ title: z.string() }),
      response: z.object({ ok: z.boolean() }),
    });
    expectTypeOf<EndpointInput<typeof endpoint>>().toEqualTypeOf<
      { params: { id: string } } & { query?: undefined } & { body: { title: string } }
    >();
    expectTypeOf<EndpointOutput<typeof endpoint>>().toEqualTypeOf<{ ok: boolean }>();
  });
});
