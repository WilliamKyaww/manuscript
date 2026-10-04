import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateToken, loadOrCreateToken, tokenFilePath, tokensEqual } from './token';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-token-'));
  dirs.push(dir);
  return path.join(dir, 'data');
}

describe('auth token', () => {
  it('generates long URL-safe tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it('persists a token on first use and reuses it', () => {
    const dir = tempDir();
    const first = loadOrCreateToken(dir);
    expect(readFileSync(tokenFilePath(dir), 'utf8').trim()).toBe(first);
    expect(loadOrCreateToken(dir)).toBe(first);
    if (process.platform !== 'win32') {
      expect(statSync(tokenFilePath(dir)).mode & 0o777).toBe(0o600);
    }
  });

  it('replaces a corrupt or weak stored token', () => {
    const dir = tempDir();
    loadOrCreateToken(dir);
    writeFileSync(tokenFilePath(dir), 'weak');
    expect(loadOrCreateToken(dir)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('prefers an explicit override without touching disk', () => {
    const dir = tempDir();
    expect(loadOrCreateToken(dir, 'x'.repeat(40))).toBe('x'.repeat(40));
  });

  it('compares tokens safely', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
    expect(tokensEqual('abc', 'abd')).toBe(false);
    expect(tokensEqual('abc', 'abcd')).toBe(false);
    expect(tokensEqual('abc', undefined)).toBe(false);
    expect(tokensEqual('abc', '')).toBe(false);
  });
});
