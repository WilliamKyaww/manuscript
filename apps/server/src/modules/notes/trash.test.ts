import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../test/helpers';
import { createTrash, type Trash } from './trash';

let test: TestContext;
let trash: Trash;
let retention = 30;

afterEach(() => test?.cleanup());

function setUp() {
  test = createTestContext();
  retention = 30;
  trash = createTrash({
    vault: test.ctx.vault,
    clock: test.clock,
    logger: test.ctx.logger,
    retentionDays: () => retention,
  });
}

const write = (relative: string, content: string) => {
  const file = path.join(test.ctx.vault.root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const exists = (relative: string) => existsSync(path.join(test.ctx.vault.root, relative));
const read = (relative: string) => readFileSync(path.join(test.ctx.vault.root, relative), 'utf8');

describe('trash', () => {
  it('moves entries into the trash and lists them newest first', () => {
    setUp();
    write('A.md', 'a');
    write('Folder/B.md', 'b');
    const first = trash.put('A.md', 'note', { 'A.md': 'note_a' });
    test.clock.advance(1000);
    const second = trash.put('Folder', 'folder', { 'Folder/B.md': 'note_b' });
    expect(first.id).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{8}$/);
    expect(exists('A.md')).toBe(false);
    expect(exists('Folder')).toBe(false);
    expect(trash.list().map((item) => [item.originalPath, item.kind, item.notes])).toEqual([
      ['Folder', 'folder', 1],
      ['A.md', 'note', 1],
    ]);
    expect(second.expiresAt).toBe('2026-11-03T12:00:01.000Z');
  });

  it('restores to the original path, or beside it if that is taken, with the recorded ids', () => {
    setUp();
    write('Notes/A.md', 'original');
    const item = trash.put('Notes/A.md', 'note', { 'Notes/A.md': 'note_a' });
    write('Notes/A.md', 'a new note with the same name');
    const restored = trash.restore(item.id, exists);
    expect(restored.path).toBe('Notes/A (restored).md');
    expect(read('Notes/A (restored).md')).toBe('original');
    expect([...restored.noteIds]).toEqual([['Notes/A (restored).md', 'note_a']]);
    expect(trash.list()).toEqual([]);
  });

  it('maps note ids inside a restored folder', () => {
    setUp();
    write('Folder/Sub/B.md', 'b');
    const item = trash.put('Folder', 'folder', { 'Folder/Sub/B.md': 'note_b' });
    mkdirSync(path.join(test.ctx.vault.root, 'Folder'));
    const restored = trash.restore(item.id, exists);
    expect(restored.path).toBe('Folder (restored)');
    expect([...restored.noteIds]).toEqual([['Folder (restored)/Sub/B.md', 'note_b']]);
    expect(read('Folder (restored)/Sub/B.md')).toBe('b');
  });

  it('purges single items and expired items', () => {
    setUp();
    write('A.md', 'a');
    write('B.md', 'b');
    const a = trash.put('A.md', 'note', {});
    retention = 1;
    trash.put('B.md', 'note', {});
    test.clock.advance(2 * 24 * 60 * 60 * 1000);
    expect(trash.purgeExpired()).toBe(1);
    expect(trash.list().map((item) => item.originalPath)).toEqual(['A.md']);
    trash.purge(a.id);
    expect(trash.list()).toEqual([]);
    expect(() => trash.purge(a.id)).toThrow(/no longer in the trash/);
  });
});
