import { z } from 'zod';

export interface ErrorIssue {
  /** Dotted path to the offending field, or an empty string for the whole value. */
  path: string;
  message: string;
}

export interface AppErrorOptions {
  details?: Record<string, unknown>;
  issues?: ErrorIssue[];
  cause?: unknown;
}

/**
 * Base class for expected, user-facing errors. The server maps these to RFC 9457 problem details;
 * anything that is not an AppError is treated as an internal error and its message is not exposed.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly issues: ErrorIssue[] | undefined;

  constructor(code: string, status: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.issues = options.issues;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    issues: ErrorIssue[] = [],
    options: Omit<AppErrorOptions, 'issues'> = {},
  ) {
    super('validation_failed', 400, message, { ...options, issues });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication is required.', options: AppErrorOptions = {}) {
    super('unauthenticated', 401, message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'This request is not allowed.', options: AppErrorOptions = {}) {
    super('forbidden', 403, message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.', options: AppErrorOptions = {}) {
    super('not_found', 404, message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('conflict', 409, message, options);
  }
}

export class UnavailableError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('unavailable', 503, message, options);
  }
}

/** Converts Zod issues into our flat issue format. */
export function issuesFromZod(error: z.ZodError): ErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** RFC 9457 problem details as returned by the API. */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  instance: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** Machine-readable extra facts (RFC 9457 extension member); never secrets. */
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export function problemType(code: string): string {
  return `urn:skb:problem:${code}`;
}
