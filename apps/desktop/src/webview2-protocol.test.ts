import { describe, expect, it } from 'vitest';
import { nativeEnvironment, readNativeMessage } from './webview2-protocol';

const origin = 'http://127.0.0.1:4317';
const state = {
  type: 'state',
  key: 'view-1',
  url: 'https://example.org/paper',
  title: 'Paper',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  issue: null,
};

describe('the private native-browser protocol', () => {
  it('accepts bounded state and preserves a returned HTTP error', () => {
    const given = { ...state, issue: { kind: 'http', code: 403 } };
    expect(readNativeMessage(JSON.stringify(given), origin)).toEqual(given);
  });

  it.each([
    origin,
    `${origin}/notes`,
    'file:///private.md',
    'javascript:alert(1)',
    'https://user:secret@example.org',
  ])('rejects a native state containing a forbidden address: %s', (url) => {
    expect(readNativeMessage(JSON.stringify({ ...state, url }), origin)).toBeNull();
  });

  it('rejects malformed messages, unbounded titles and unknown issue kinds', () => {
    for (const value of [
      '{',
      JSON.stringify({ ...state, title: 'x'.repeat(513) }),
      JSON.stringify({ ...state, issue: { kind: 'execute', code: 0 } }),
    ])
      expect(readNativeMessage(value, origin)).toBeNull();
  });

  it('removes SDK overrides and application secrets from the helper environment', () => {
    const env = nativeEnvironment({
      PATH: 'tools',
      WEBVIEW2_USER_DATA_FOLDER: 'real-profile',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--disable-web-security',
      SKB_AUTH_TOKEN: 'secret',
      SKB_SECRETS_KEY: 'key',
      OPENAI_API_KEY: 'key',
      ELECTRON_RUN_AS_NODE: '1',
    });
    expect(env).toEqual({ PATH: 'tools' });
  });
});
