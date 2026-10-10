import { ConflictError, NotFoundError, ProblemDetailsSchema, ValidationError } from '@skb/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../shared/logger';
import { errorHandler, toProblem } from './problem';

describe('problem details', () => {
  it('maps application errors with their code, status and issues', () => {
    const problem = toProblem(
      new ValidationError('Bad input.', [{ path: 'title', message: 'Required' }]),
      '/api/x',
    );
    expect(problem).toEqual({
      type: 'urn:skb:problem:validation_failed',
      title: 'Invalid request',
      status: 400,
      detail: 'Bad input.',
      code: 'validation_failed',
      instance: '/api/x',
      issues: [{ path: 'title', message: 'Required' }],
    });
    expect(toProblem(new ConflictError('Changed.')).status).toBe(409);
    expect(ProblemDetailsSchema.safeParse(toProblem(new NotFoundError())).success).toBe(true);
  });

  it('maps Hono HTTP exceptions', () => {
    expect(toProblem(new HTTPException(404, { message: 'Gone' }))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('says what to do about trouble with the disk, files and database, without repeating paths or SQL', () => {
    const fileError = (code: string) =>
      Object.assign(new Error(`${code}: operation failed, open 'C:\\Users\\will\\Vault\\a.md'`), {
        code,
      });
    const cases: [unknown, number, string, RegExp][] = [
      [fileError('ENOENT'), 404, 'not_found', /no longer there/u],
      [fileError('EACCES'), 409, 'conflict', /read-only, or open in another program/u],
      [fileError('EPERM'), 409, 'conflict', /read-only/u],
      [fileError('EBUSY'), 409, 'conflict', /in use by another program/u],
      [fileError('ENOSPC'), 503, 'unavailable', /disk is full/u],
      [fileError('EMFILE'), 503, 'unavailable', /Too many files/u],
      [fileError('ENAMETOOLONG'), 400, 'validation_failed', /too long/u],
      [{ code: 'ERR_SQLITE_ERROR', errcode: 5 }, 503, 'unavailable', /database is busy/u],
      [{ code: 'ERR_SQLITE_ERROR', errcode: 13 }, 503, 'unavailable', /disk is full/u],
      [{ code: 'ERR_SQLITE_ERROR', errcode: 11 }, 503, 'unavailable', /damaged.*backups/u],
      [{ code: 'ERR_SQLITE_ERROR', errcode: 26 }, 503, 'unavailable', /damaged/u],
    ];
    for (const [error, status, code, detail] of cases) {
      const problem = toProblem(error, '/api/x');
      expect([problem.status, problem.code]).toEqual([status, code]);
      expect(problem.detail).toMatch(detail);
      expect(JSON.stringify(problem)).not.toContain('Vault');
    }
    // A constraint violation or anything else unknown stays an internal error.
    expect(toProblem({ code: 'ERR_SQLITE_ERROR', errcode: 19 }).code).toBe('internal');
    expect(toProblem(new Error('x')).code).toBe('internal');
  });

  it('hides unexpected errors from clients but logs them', async () => {
    const logged: string[] = [];
    const logger = createLogger({
      level: 'debug',
      format: 'json',
      write: (line) => logged.push(line),
    });
    const app = new Hono();
    app.onError(errorHandler(logger));
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    const response = await app.request('/boom');
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    const body = ProblemDetailsSchema.parse(await response.json());
    expect(body.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(logged.join('\n')).toContain('Unhandled error');
  });
});
