import { describe, expect, it } from 'vitest';
import { describeProviderError, scrubSecrets } from './errors';

describe('provider errors', () => {
  it('says that the network is the problem, however deep the code is', () => {
    const offline = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.openai.com'), {
        code: 'ENOTFOUND',
      }),
    });
    expect(describeProviderError(offline)).toMatch(
      /Could not reach the provider \(ENOTFOUND\).*offline/u,
    );
    const wrapped = new Error('Cannot connect to API', {
      cause: new TypeError('fetch failed', {
        cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }),
      }),
    });
    expect(describeProviderError(wrapped)).toMatch(/ECONNREFUSED/u);
    expect(describeProviderError(new Error('boom'))).toBe('boom');
  });

  it('removes anything that looks like a key', () => {
    expect(scrubSecrets('Incorrect API key provided: sk-abcdef123456789')).toBe(
      'Incorrect API key provided: [hidden]',
    );
  });
});
