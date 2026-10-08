import {
  buildPath,
  buildQuery,
  type Endpoint,
  type EndpointInput,
  type EndpointOutput,
  type ProblemDetails,
  ProblemDetailsSchema,
} from '@skb/core';
import type { z } from 'zod';

/**
 * Typed HTTP client built on the shared API contracts in `@skb/core` (ADR-0024). Responses are
 * validated with the same Zod schemas the server uses, so the UI never trusts malformed data.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(
    status: number,
    problem: ProblemDetails | null,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }

  /** Machine-readable code from the problem details (`unreachable` when the server could not be contacted). */
  get code(): string {
    if (this.status === 0) return 'unreachable';
    return this.problem?.code ?? `http_${this.status}`;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

type InputArgs<E extends Endpoint> =
  object extends EndpointInput<E> ? [input?: EndpointInput<E>] : [input: EndpointInput<E>];

export interface ApiClient {
  request<E extends Endpoint>(endpoint: E, ...args: InputArgs<E>): Promise<EndpointOutput<E>>;
  /** Multipart upload (attachments): POSTs `form` to `path` and validates the reply with `schema`. */
  upload<T extends z.ZodType>(path: string, form: FormData, schema: T): Promise<z.output<T>>;
}

export interface ApiClientOptions {
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Prefix for request URLs; empty means same origin. */
  baseUrl?: string;
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    const parsed = ProblemDetailsSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const baseUrl = options.baseUrl ?? '';

  /** Sends a request and validates a successful JSON reply against `schema`. */
  async function send<T extends z.ZodType>(
    url: string,
    init: RequestInit,
    schema: T,
  ): Promise<z.output<T>> {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (cause) {
      throw new ApiError(0, null, 'Cannot reach the Manuscript server. Is it running?', {
        cause,
      });
    }

    if (!response.ok) {
      const problem = await readProblem(response);
      throw new ApiError(
        response.status,
        problem,
        problem?.detail ?? `Request failed with status ${response.status}.`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new ApiError(
        response.status,
        null,
        'The server sent a response that is not valid JSON.',
        { cause },
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(response.status, null, 'The server sent an unexpected response.', {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return {
    request<E extends Endpoint>(endpoint: E, ...args: InputArgs<E>): Promise<EndpointOutput<E>> {
      const input = args[0] as
        | { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }
        | undefined;
      const url = `${baseUrl}${buildPath(endpoint.path, input?.params)}${buildQuery(input?.query)}`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      const init: RequestInit = { method: endpoint.method, credentials: 'same-origin', headers };
      if (input?.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(input.body);
      }
      return send(url, init, endpoint.schemas.response) as Promise<EndpointOutput<E>>;
    },
    upload(path, form, schema) {
      // No Content-Type header: the browser sets the multipart boundary itself.
      return send(
        `${baseUrl}${path}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          body: form,
        },
        schema,
      );
    },
  };
}
