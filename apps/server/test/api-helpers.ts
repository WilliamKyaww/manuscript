import { expect } from 'vitest';
import type { z } from 'zod';

type Requester = (path: string, init?: RequestInit) => Promise<Response> | Response;

/** JSON helpers over a test app's `request`, asserting the status of every call. */
export function jsonApi(request: Requester) {
  const send = async <T>(
    method: string,
    path: string,
    body: unknown,
    status: number,
    schema?: z.ZodType<T>,
  ): Promise<T> => {
    const response = await request(path, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    });
    const text = await response.text();
    expect(response.status, `${method} ${path}: ${text}`).toBe(status);
    const parsed = text === '' ? undefined : JSON.parse(text);
    return (schema ? schema.parse(parsed) : parsed) as T;
  };
  return {
    get: <T = unknown>(path: string, schema?: z.ZodType<T>, status = 200) =>
      send<T>('GET', path, undefined, status, schema),
    post: <T = unknown>(path: string, body: unknown, status = 201, schema?: z.ZodType<T>) =>
      send<T>('POST', path, body, status, schema),
    patch: <T = unknown>(path: string, body: unknown, status = 200, schema?: z.ZodType<T>) =>
      send<T>('PATCH', path, body, status, schema),
    put: <T = unknown>(path: string, body: unknown, status = 200, schema?: z.ZodType<T>) =>
      send<T>('PUT', path, body, status, schema),
    delete: <T = unknown>(path: string, status = 200) => send<T>('DELETE', path, undefined, status),
  };
}
