import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveInVault, toVaultRelative, vaultPathSegments } from './paths';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempVault(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-paths-'));
  dirs.push(dir);
  return dir;
}

describe('vault path containment', () => {
  it('resolves ordinary relative paths with either separator', () => {
    const root = tempVault();
    expect(resolveInVault(root, 'Notes/Consensus.md')).toBe(
      path.join(root, 'Notes', 'Consensus.md'),
    );
    expect(resolveInVault(root, 'Notes\\Week 1\\Paxos.md')).toBe(
      path.join(root, 'Notes', 'Week 1', 'Paxos.md'),
    );
    expect(resolveInVault(root, './a//b/./c.md')).toBe(path.join(root, 'a', 'b', 'c.md'));
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['../secret.txt', '".."'],
    ['notes/../../x', '".."'],
    ['/etc/passwd', 'absolute'],
    ['\\\\server\\share\\x', 'absolute'],
    ['C:\\Windows\\system.ini', 'absolute'],
    ['C:relative', 'absolute'],
    ['a\0b', 'NUL'],
    ['notes/CON', 'reserved'],
    ['nul.txt', 'reserved'],
    ['notes/LPT1.md', 'reserved'],
    ['what?.md', 'portable'],
    ['a<b>.md', 'portable'],
    ['trailing.', 'dot or space'],
    ['trailing ', 'dot or space'],
    ['.skb/skb.db', 'reserved for the application'],
    ['.SKB/lock', 'reserved for the application'],
  ])('rejects %j (%s)', (input, reason) => {
    const root = tempVault();
    expect(() => resolveInVault(root, input)).toThrow(new RegExp(reason.replace(/[".?]/g, '.')));
  });

  it('allows the metadata folder only for internal callers', () => {
    const root = tempVault();
    expect(resolveInVault(root, '.skb/cache/x', { allowInternal: true })).toBe(
      path.join(root, '.skb', 'cache', 'x'),
    );
  });

  it('rejects links that lead outside the vault', () => {
    const root = tempVault();
    const outside = tempVault();
    mkdirSync(path.join(outside, 'target'));
    // Junctions need no special privileges on Windows; elsewhere use a directory symlink.
    symlinkSync(
      path.join(outside, 'target'),
      path.join(root, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() => resolveInVault(root, 'escape/file.md')).toThrow(/link that leads outside/);
    expect(resolveInVault(root, 'escape/file.md', { checkLinks: false })).toBe(
      path.join(root, 'escape', 'file.md'),
    );
  });

  it('converts absolute paths back to portable relative paths', () => {
    const root = tempVault();
    expect(toVaultRelative(root, path.join(root, 'Notes', 'A.md'))).toBe('Notes/A.md');
    expect(() => toVaultRelative(root, path.join(root, '..', 'x'))).toThrow(/not inside the vault/);
    expect(() => toVaultRelative(root, root)).toThrow(/not inside the vault/);
  });

  it('exposes validated segments', () => {
    expect(vaultPathSegments('a/b\\c.md')).toEqual(['a', 'b', 'c.md']);
  });
});
