import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../../shared/logger';
import { createFileSecretStore } from './store';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const temp = () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-secrets-'));
  folders.push(folder);
  return folder;
};

describe('AI keys at rest', () => {
  it('are kept in a file the user can read, as before, when no key is given (web mode)', () => {
    const dir = temp();
    const store = createFileSecretStore(dir, silentLogger);
    store.set('provider-1', 'sk-live-0123456789');
    expect(JSON.parse(readFileSync(path.join(dir, 'secrets.json'), 'utf8'))).toEqual({
      version: 1,
      secrets: { 'provider-1': 'sk-live-0123456789' },
    });
    expect(createFileSecretStore(dir, silentLogger).get('provider-1')).toBe('sk-live-0123456789');
  });

  it('are encrypted when the desktop app gives the server a key, and open again with it', () => {
    const dir = temp();
    const key = randomBytes(32);
    const store = createFileSecretStore(dir, silentLogger, key);
    store.set('provider-1', 'sk-live-0123456789');
    store.set('provider-2', 'another-secret');
    const text = readFileSync(path.join(dir, 'secrets.json'), 'utf8');
    expect(text).not.toContain('sk-live');
    expect(JSON.parse(text)).toMatchObject({ version: 2, algorithm: 'aes-256-gcm' });

    const again = createFileSecretStore(dir, silentLogger, key);
    expect(again.get('provider-1')).toBe('sk-live-0123456789');
    again.delete('provider-1');
    expect(createFileSecretStore(dir, silentLogger, key).get('provider-1')).toBeNull();
    expect(createFileSecretStore(dir, silentLogger, key).get('provider-2')).toBe('another-secret');

    // A different key opens nothing (the file is authenticated, not just scrambled).
    expect(createFileSecretStore(dir, silentLogger, randomBytes(32)).get('provider-2')).toBeNull();
  });

  it('encrypts keys that were saved in plain text the first time they are read', () => {
    const dir = temp();
    writeFileSync(
      path.join(dir, 'secrets.json'),
      JSON.stringify({ version: 1, secrets: { 'provider-1': 'sk-old-key-123456' } }),
    );
    const key = randomBytes(32);
    expect(createFileSecretStore(dir, silentLogger, key).get('provider-1')).toBe(
      'sk-old-key-123456',
    );
    expect(readFileSync(path.join(dir, 'secrets.json'), 'utf8')).not.toContain('sk-old-key');
    expect(createFileSecretStore(dir, silentLogger, key).get('provider-1')).toBe(
      'sk-old-key-123456',
    );
  });

  it('are never overwritten by a copy that cannot open them', () => {
    const dir = temp();
    createFileSecretStore(dir, silentLogger, randomBytes(32)).set(
      'provider-1',
      'sk-live-0123456789',
    );
    const before = readFileSync(path.join(dir, 'secrets.json'), 'utf8');
    // The web launcher on the same data folder has no key: it sees no keys and must not wipe them.
    const web = createFileSecretStore(dir, silentLogger);
    expect(web.get('provider-1')).toBeNull();
    expect(() => web.set('provider-2', 'x')).toThrow(/desktop app/u);
    expect(readFileSync(path.join(dir, 'secrets.json'), 'utf8')).toBe(before);
  });
});
