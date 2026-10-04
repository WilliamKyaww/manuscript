import {
  type Endpoint,
  type EndpointOutput,
  issuesFromZod,
  type ParsedInput,
  ValidationError,
} from '@skb/core';
import type { Context, Hono } from 'hono';
import type { z } from 'zod';

/** Collects what the security layer needs to know about registered endpoints. */
export interface ApiRegistry {
  readonly app: Hono;
  readonly publicApiRoutes: Set<string>;
  /** Validate handler output against the response schema (on outside production). */
  readonly validateResponses: boolean;
}

export type EndpointHandler<E extends Endpoint> = (
  input: ParsedInput<E>,
  c: Context,
) => EndpointOutput<E> | Promise<EndpointOutput<E>>;

function parseWith<T extends z.ZodType>(schema: T, value: unknown, part: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid request ${part}.`, issuesFromZod(result.error));
  }
  return result.data;
}

function queryObject(c: Context): Record<string, string | string[]> {
  const entries = Object.entries(c.req.queries());
  return Object.fromEntries(
    entries.map(([key, values]) => [key, values.length === 1 ? (values[0] ?? '') : values]),
  );
}

/** Registers a route from a shared contract, validating params, query and body with its schemas. */
export function registerEndpoint<E extends Endpoint>(
  registry: ApiRegistry,
  endpoint: E,
  handler: EndpointHandler<E>,
): void {
  const { method, path, auth, schemas } = endpoint;
  if (auth === 'none') {
    if (path.includes(':'))
      throw new Error(`Public endpoints may not have path parameters: ${path}`);
    registry.publicApiRoutes.add(`${method} ${path}`);
  }

  registry.app.on(method, path, async (c) => {
    const params = schemas.params
      ? parseWith(schemas.params, c.req.param(), 'path parameters')
      : {};
    const query = schemas.query ? parseWith(schemas.query, queryObject(c), 'query') : {};
    let body: unknown;
    if (schemas.body) {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        throw new ValidationError('The request body must be valid JSON.');
      }
      body = parseWith(schemas.body, raw, 'body');
    }

    const result = await handler({ params, query, body } as ParsedInput<E>, c);
    if (registry.validateResponses) {
      const checked = schemas.response.safeParse(result);
      if (!checked.success) {
        throw new Error(
          `Response for ${method} ${path} does not match its contract: ${checked.error.message}`,
        );
      }
    }
    return c.json(result as object, 200);
  });
}
