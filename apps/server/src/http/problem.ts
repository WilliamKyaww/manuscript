import { AppError, type ProblemDetails, problemType } from '@skb/core';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from '../shared/logger';

const TITLES: Record<string, string> = {
  validation_failed: 'Invalid request',
  unauthenticated: 'Authentication required',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  internal: 'Internal error',
};

const CODES_BY_STATUS: Record<number, string> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  503: 'unavailable',
};

export function toProblem(error: unknown, instance?: string): ProblemDetails {
  if (error instanceof AppError) {
    return {
      type: problemType(error.code),
      title: TITLES[error.code] ?? 'Error',
      status: error.status,
      detail: error.message,
      code: error.code,
      ...(instance ? { instance } : {}),
      ...(error.issues && error.issues.length > 0 ? { issues: error.issues } : {}),
    };
  }
  if (error instanceof HTTPException) {
    const code = CODES_BY_STATUS[error.status] ?? 'error';
    return {
      type: problemType(code),
      title: TITLES[code] ?? 'Error',
      status: error.status,
      detail: error.message || TITLES[code] || 'Error',
      code,
      ...(instance ? { instance } : {}),
    };
  }
  return {
    type: problemType('internal'),
    title: TITLES.internal ?? 'Internal error',
    status: 500,
    detail: 'An unexpected error occurred. Details have been written to the server log.',
    code: 'internal',
    ...(instance ? { instance } : {}),
  };
}

export function problemResponse(problem: ProblemDetails): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json; charset=utf-8' },
  });
}

/** Maps every thrown error to RFC 9457 problem details; unexpected errors are logged, not exposed. */
export function errorHandler(logger: Logger): ErrorHandler {
  return (error, c) => {
    const problem = toProblem(error, c.req.path);
    if (problem.status >= 500) {
      logger.error('Unhandled error', { method: c.req.method, path: c.req.path, error });
    } else {
      logger.debug('Request rejected', {
        method: c.req.method,
        path: c.req.path,
        code: problem.code,
      });
    }
    return problemResponse(problem);
  };
}
