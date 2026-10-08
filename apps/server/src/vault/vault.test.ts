import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIdFactory, isId } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../shared/clock';
import { type OpenVaultOptions, openVault, VaultLockedError } from './vault';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-vault-'));
  dirs.push(dir);
  return path.join(dir, 'My Vault');
}

const baseOptions = (overrides: Partial<OpenVaultOptions> = {}): OpenVaultOptions => ({
  create: true,
  clock: new FixedClock('2026-10-04T12:00:00.000Z'),
  ids: createIdFactory(),
  appVersion: '0.1.0',
  hostname: 'test-host',
  ...overrides,
});

describe('openVault', () => {
  it('creates the layout and vault.json on first open', () => {
    const root = tempRoot();
    const vault = openVault(root, baseOptions());
    try {
      expect(vault.root).toBe(path.resolve(root));
      expect(vault.name).toBe('My Vault');
      expect(isId(vault.id, 'vault')).toBe(true);
      for (const dir of ['trash', 'history', 'cache', 'logs', 'backups']) {
        expect(existsSync(path.join(root, '.skb', dir))).toBe(true);
      }
      const file = JSON.parse(readFileSync(path.join(root, '.skb', 'vault.json'), 'utf8'));
      expect(file).toEqual({
        id: vault.id,
        layoutVersion: 1,
        createdAt: '2026-10-04T12:00:00.000Z',
        createdBy: 'manuscript@0.1.0',
      });
      expect(vault.paths.database).toBe(path.join(root, '.skb', 'skb.db'));
    } finally {
      vault.close();
    }
  });

  it('keeps the same identity when reopened', () => {
    const root = tempRoot();
    const first = openVault(root, baseOptions());
    first.close();
    const second = openVault(root, baseOptions());
    second.close();
    expect(second.id).toBe(first.id);
  });

  it('refuses to open a missing folder unless asked to create it', () => {
    expect(() => openVault(tempRoot(), baseOptions({ create: false }))).toThrow(/not found/);
  });

  it('prevents a second live process from opening the same vault', () => {
    const root = tempRoot();
    const first = openVault(root, baseOptions({ pid: 1001, isProcessAlive: () => true }));
    try {
      expect(() => openVault(root, baseOptions({ pid: 1002, isProcessAlive: () => true }))).toThrow(
        VaultLockedError,
      );
    } finally {
      first.close();
    }
    // Released lock: a new process can open it.
    openVault(root, baseOptions({ pid: 1002 })).close();
  });

  it('recovers a stale lock left by a crashed process', () => {
    const root = tempRoot();
    openVault(root, baseOptions()).close();
    writeFileSync(
      path.join(root, '.skb', 'lock'),
      JSON.stringify({
        pid: 999_999,
        hostname: 'test-host',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const vault = openVault(root, baseOptions({ pid: 1003, isProcessAlive: () => false }));
    vault.close();
    expect(existsSync(path.join(root, '.skb', 'lock'))).toBe(false);
  });

  it('recovers an unreadable lock file', () => {
    const root = tempRoot();
    openVault(root, baseOptions()).close();
    writeFileSync(path.join(root, '.skb', 'lock'), 'garbage');
    openVault(root, baseOptions()).close();
  });

  it('does not steal a lock held by another computer', () => {
    const root = tempRoot();
    openVault(root, baseOptions()).close();
    writeFileSync(
      path.join(root, '.skb', 'lock'),
      JSON.stringify({ pid: 5, hostname: 'laptop-2', startedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(() => openVault(root, baseOptions())).toThrow(/another computer/);
  });

  it('rejects vaults written by a newer application', () => {
    const root = tempRoot();
    const vault = openVault(root, baseOptions());
    vault.close();
    const file = path.join(root, '.skb', 'vault.json');
    const contents = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...contents, layoutVersion: 99 }));
    expect(() => openVault(root, baseOptions())).toThrow(/newer than this application/);
    // The failed open must not leave a lock behind.
    expect(existsSync(path.join(root, '.skb', 'lock'))).toBe(false);
  });

  it('resolves and relativises paths within the vault', () => {
    const root = tempRoot();
    const vault = openVault(root, baseOptions());
    try {
      const absolute = vault.resolve('Notes/Week 1.md');
      expect(vault.relative(absolute)).toBe('Notes/Week 1.md');
      expect(() => vault.resolve('../outside.md')).toThrow();
    } finally {
      vault.close();
    }
  });
});
