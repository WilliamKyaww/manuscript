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
