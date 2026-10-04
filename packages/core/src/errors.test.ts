import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  ConflictError,
  issuesFromZod,
  NotFoundError,
  ProblemDetailsSchema,
  problemType,
  ValidationError,
} from './errors';

describe('errors', () => {
  it('carries a code, status and name', () => {
    const error = new NotFoundError('Note not found.');
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('not_found');
    expect(error.status).toBe(404);
    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('Note not found.');
  });

  it('keeps details and causes', () => {
    const cause = new Error('disk full');
    const error = new ConflictError('Changed on disk.', { details: { path: 'a.md' }, cause });
    expect(error.details).toEqual({ path: 'a.md' });
    expect(error.cause).toBe(cause);
  });

  it('converts Zod issues to flat paths', () => {
    const result = z.object({ a: z.object({ b: z.number() }) }).safeParse({ a: { b: 'x' } });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = issuesFromZod(result.error);
    expect(issues[0]?.path).toBe('a.b');
    const error = new ValidationError('Invalid input.', issues);
    expect(error.status).toBe(400);
    expect(error.issues).toHaveLength(1);
  });

  it('describes problem details', () => {
    const problem = {
      type: problemType('not_found'),
      title: 'Not found',
      status: 404,
      code: 'not_found',
    };
    expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
    expect(problem.type).toBe('urn:skb:problem:not_found');
  });
});
