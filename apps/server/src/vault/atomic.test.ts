import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ATOMIC_TEMP_PATTERN, assertPathFits, writeFileAtomic } from './atomic';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-atomic-'));
  dirs.push(dir);
  return dir;
}

describe('long paths on Windows', () => {
  it('says so in words instead of failing with "file not found"', () => {
    const long = `C:\\Users\\will\\Vault\\${'a'.repeat(120)}\\${'b'.repeat(120)}\\note.md`;
    expect(() => assertPathFits(long, 'win32')).toThrow(/longer than Windows allows/u);
    expect(() => assertPathFits('C:\\Users\\will\\Vault\\note.md', 'win32')).not.toThrow();
    // Other systems have much longer limits, and a verbatim path is the caller's choice.
    expect(() => assertPathFits(long, 'linux')).not.toThrow();
    expect(() => assertPathFits(`\\\\?\\${long}`, 'win32')).not.toThrow();
  });

  it.runIf(process.platform === 'win32')('refuses a write that Windows would not accept', () => {
    const dir = tempDir();
    const target = path.join(dir, 'a'.repeat(130), 'b'.repeat(130), 'note.md');
    expect(() => writeFileAtomic(target, 'x')).toThrow(/longer than Windows allows/u);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('writeFileAtomic', () => {
  it('creates missing directories and writes text', () => {
    const dir = tempDir();
    const target = path.join(dir, 'nested', 'deep', 'note.md');
    writeFileAtomic(target, '# Hello\n');
    expect(readFileSync(target, 'utf8')).toBe('# Hello\n');
  });

  it('replaces existing files and leaves no temporary files behind', () => {
    const dir = tempDir();
    const target = path.join(dir, 'note.md');
    writeFileSync(target, 'old');
    writeFileAtomic(target, new Uint8Array([110, 101, 119]));
    expect(readFileSync(target, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['note.md']);
  });

  it('handles names with spaces and Unicode', () => {
    const dir = tempDir();
    const target = path.join(dir, 'Lecture 3 — Consensus & Paxos.md');
    writeFileAtomic(target, 'ü', { fsync: false });
    expect(readFileSync(target, 'utf8')).toBe('ü');
  });

  it('describes its temporary file names so watchers can ignore them', () => {
    expect(ATOMIC_TEMP_PATTERN.test('.note.md.1234.deadbeef.tmp')).toBe(true);
    expect(ATOMIC_TEMP_PATTERN.test('note.md')).toBe(false);
  });
});
