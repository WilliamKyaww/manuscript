import type { z } from 'zod';

/**
 * Shared HTTP API contracts (ADR-0024). The server registers routes from these definitions and
 * validates input with their schemas; the web client builds requests and validates responses with
 * the same schemas, so neither side imports the other's code.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiPath = `/api/${string}`;

export interface EndpointSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

export interface Endpoint<S extends EndpointSchemas = EndpointSchemas> {
  readonly method: HttpMethod;
  readonly path: ApiPath;
  /** `none` only for endpoints that must work before authentication (e.g. readiness pings). */
  readonly auth: 'required' | 'none';
  readonly schemas: S;
}

export interface EndpointDefinition {
  method: HttpMethod;
  path: ApiPath;
  auth?: 'required' | 'none';
}

export function defineEndpoint<S extends EndpointSchemas>(
  definition: EndpointDefinition & S,
): Endpoint<S> {
  const { method, path, auth = 'required', ...schemas } = definition;
  return { method, path, auth, schemas: schemas as unknown as S };
}

type ParamsInput<S> = S extends { params: infer P extends z.ZodType }
  ? { params: z.input<P> }
  : { params?: undefined };
type QueryInput<S> = S extends { query: infer Q extends z.ZodType }
  ? { query?: z.input<Q> }
  : { query?: undefined };
type BodyInput<S> = S extends { body: infer B extends z.ZodType }
  ? { body: z.input<B> }
  : { body?: undefined };

/** What a client must supply to call an endpoint. */
export type EndpointInput<E extends Endpoint> = ParamsInput<E['schemas']> &
  QueryInput<E['schemas']> &
  BodyInput<E['schemas']>;

/** The parsed, validated response of an endpoint. */
export type EndpointOutput<E extends Endpoint> = z.output<E['schemas']['response']>;

/** Server-side view of validated input. */
export interface ParsedInput<E extends Endpoint> {
  params: E['schemas'] extends { params: infer P extends z.ZodType }
    ? z.output<P>
    : Record<string, never>;
  query: E['schemas'] extends { query: infer Q extends z.ZodType }
    ? z.output<Q>
    : Record<string, never>;
  body: E['schemas'] extends { body: infer B extends z.ZodType } ? z.output<B> : undefined;
}

/** Substitutes `:name` segments with URL-encoded values. Throws if a parameter is missing. */
export function buildPath(path: string, params: Record<string, unknown> | undefined): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing path parameter "${name}" for ${path}`);
    }
    return encodeURIComponent(String(value));
  });
}

/** Serialises a flat query object; arrays become repeated keys and undefined values are skipped. */
export function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
