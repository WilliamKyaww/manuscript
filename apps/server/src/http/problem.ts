import { AppError, type ProblemDetails, problemType } from '@skb/core';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sqliteErrorCode } from '../db/sqlite';
import type { Logger } from '../shared/logger';

const TITLES: Record<string, string> = {
  validation_failed: 'Invalid request',
  unauthenticated: 'Authentication required',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  locked: 'Cannot be changed',
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

/**
 * Failures of the machine rather than of the request — a full disk, a file another program holds, a
 * busy or damaged database — said in words the student can act on. Nothing from the error itself
 * (paths, SQL) is repeated to the client.
 */
export function systemProblem(
  error: unknown,
): { status: number; code: string; detail: string } | null {
  const sqlite = sqliteErrorCode(error);
  if (sqlite !== undefined) {
    // SQLITE_BUSY, LOCKED, READONLY, IOERR, CORRUPT, FULL, CANTOPEN, NOTADB.
    if (sqlite === 5 || sqlite === 6)
      return {
        status: 503,
        code: 'unavailable',
        detail: 'The database is busy. Try again in a moment.',
      };
    if (sqlite === 13)
      return {
        status: 503,
        code: 'unavailable',
        detail: 'The disk is full, so nothing more can be saved. Free some space and try again.',
      };
    if (sqlite === 11 || sqlite === 26)
      return {
        status: 503,
        code: 'unavailable',
        detail:
          'The database file is damaged. Close Manuscript and put back one of the copies in the vault’s .skb/backups folder (Settings → Data explains how); your notes are not affected.',
      };
    if (sqlite === 8 || sqlite === 10 || sqlite === 14)
      return {
        status: 503,
        code: 'unavailable',
        detail:
          'The database could not be written to. Check that the vault’s .skb folder is on a disk that is connected and not read-only.',
      };
    return null;
  }
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'ENOENT':
      return {
        status: 404,
        code: 'not_found',
        detail:
          'A file or folder is no longer there. It may have been moved or deleted outside Manuscript; read the files again from Settings → Data.',
      };
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      // Not 409: the editor reads a 409 on save as "the file changed on disk".
      return {
        status: 423,
        code: 'locked',
        detail:
          'Manuscript is not allowed to change that file or folder: it may be read-only, or open in another program.',
      };
    case 'EBUSY':
      return {
        status: 423,
        code: 'locked',
        detail: 'That file is in use by another program. Close it there and try again.',
      };
    case 'ENOSPC':
      return {
        status: 503,
        code: 'unavailable',
        detail: 'The disk is full, so nothing more can be saved. Free some space and try again.',
      };
    case 'EMFILE':
    case 'ENFILE':
      return {
        status: 503,
        code: 'unavailable',
        detail: 'Too many files are open at once. Try again in a moment.',
      };
    case 'ENAMETOOLONG':
      return {
        status: 400,
        code: 'validation_failed',
        detail: 'A file or folder name in that path is too long for this computer.',
      };
    default:
      return null;
  }
}

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
      ...(error.details ? { details: error.details } : {}),
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
  const system = systemProblem(error);
  if (system) {
    return {
      type: problemType(system.code),
      title: TITLES[system.code] ?? 'Error',
      status: system.status,
      detail: system.detail,
      code: system.code,
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
    if (problem.status >= 500 && problem.code === 'internal') {
      logger.error('Unhandled error', { method: c.req.method, path: c.req.path, error });
    } else if (problem.status >= 500) {
      // Expected trouble with the machine (disk, locks): said to the student, noted for the log.
      logger.warn('Request failed', {
        method: c.req.method,
        path: c.req.path,
        code: problem.code,
        error,
      });
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
