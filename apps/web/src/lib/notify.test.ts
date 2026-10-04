import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { describeError } from './notify';

describe('describeError', () => {
  it('explains an unreachable server', () => {
    expect(describeError(new ApiError(0, null, 'x')).title).toBe('Cannot reach the local server');
  });

  it('explains a lost session', () => {
    expect(describeError(new ApiError(401, null, 'x')).title).toBe('Signed out');
  });

  it('uses problem details when present', () => {
    const error = new ApiError(
      409,
      {
        type: 'urn:skb:problem:conflict',
        title: 'Conflict',
        status: 409,
        code: 'conflict',
        detail: 'Changed on disk.',
      },
      'Changed on disk.',
    );
    expect(describeError(error)).toEqual({ title: 'Conflict', description: 'Changed on disk.' });
  });

  it('copes with ordinary errors and non-errors', () => {
    expect(describeError(new Error('boom'))).toEqual({
      title: 'Something went wrong',
      description: 'boom',
    });
    expect(describeError('odd')).toEqual({ title: 'Something went wrong', description: 'odd' });
  });
});
