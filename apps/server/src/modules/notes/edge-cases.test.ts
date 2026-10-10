import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  NoteDetailSchema,
  NoteTreeSchema,
  ProblemDetailsSchema,
  SearchResponseSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonApi } from '../../../test/api-helpers';
import { createTestApp } from '../../../test/helpers';

/**
 * Phase 17, task 17.07: the files students really have. Names in other scripts and in either
 * Unicode normal form, files that are not UTF-8, and a file that is read-only must neither be
 * damaged nor produce a message that blames the wrong thing.
 */

let harness: ReturnType<typeof createTestApp> | undefined;
afterEach(() => {
  harness?.cleanup();
  harness = undefined;
});

async function open() {
  harness = createTestApp();
  await harness.modules.notes.start({ watch: false });
  const abs = (relative: string) =>
    path.join(harness?.ctx.vault.root ?? '', ...relative.split('/'));
  const write = (relative: string, content: string | Uint8Array) => {
    mkdirSync(path.dirname(abs(relative)), { recursive: true });
    writeFileSync(abs(relative), content);
  };
  const scan = () => harness?.modules.notes.indexer.scan();
  return { api: jsonApi(harness.request), abs, write, scan, request: harness.request };
}

describe('names in other scripts', () => {
  it('keeps them, links to them, finds them, and treats the two Unicode forms as one name', async () => {
    const { api, write, scan } = await open();
    write('Übung 1 — Verteilte Systeme.md', '# Übung\n\nSiehe [[日本語のノート]] und [[עברית]].\n');
    write('Notes/日本語のノート.md', '# 日本語のノート\n\nコンセンサスアルゴリズム。\n');
    write('Notes/עברית.md', '# עברית\n\nשלום\n');
    write('Notes/Emoji 📚 plan.md', '# Plan 📚\n\nSee [[Ubung]].\n');
    // A name written the way macOS does (decomposed), linked to the way Windows does (composed).
    write('Notes/Übung.md', '# Ubung\n');
    write('Notes/Links.md', 'See [[Übung]].\n');
    await scan();

    const tree = await api.get('/api/notes', NoteTreeSchema);
    const titles = tree.notes.map((note) => note.title).sort();
    expect(titles).toContain('日本語のノート');
    expect(titles).toContain('עברית');
    expect(titles).toContain('Emoji 📚 plan');

    const german = tree.notes.find((note) => note.path === 'Übung 1 — Verteilte Systeme.md');
    expect(german).toBeDefined();
    const detail = await api.get(`/api/notes/${german?.id}`, NoteDetailSchema);
    expect(detail.links.map((link) => link.target).sort()).toEqual(['עברית', '日本語のノート']);
    const japanese = tree.notes.find((note) => note.title === '日本語のノート');
    const backlinks = await api.get<{ linked: { source: { path: string } }[] }>(
      `/api/notes/${japanese?.id}/backlinks`,
    );
    expect(backlinks.linked.map((link) => link.source.path)).toEqual([
      'Übung 1 — Verteilte Systeme.md',
    ]);

    // Full-text search works in these scripts.
    const found = await api.get(
      `/api/search?q=${encodeURIComponent('コンセンサス')}`,
      SearchResponseSchema,
    );
    expect(
      found.results.map((result) => (result.kind === 'note' ? result.note.path : '')),
    ).toContain('Notes/日本語のノート.md');

    // [[Übung]] (composed) reaches the note whose file name is decomposed.
    const decomposed = tree.notes.find((note) => note.path === 'Notes/Übung.md');
    const reached = await api.get<{ linked: { source: { path: string } }[] }>(
      `/api/notes/${decomposed?.id}/backlinks`,
    );
    expect(reached.linked.map((link) => link.source.path)).toContain('Notes/Links.md');
  });
});

describe('files that are not UTF-8', () => {
  it('is listed and readable, is never rewritten, and cannot be saved over', async () => {
    const { api, write, abs, scan } = await open();
    // UTF-16 with a byte-order mark: what some Windows editors write.
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('# Lecture\n\nPaxos\n', 'utf16le'),
    ]);
    write('Legacy.md', utf16);
    write('Latin1.md', Buffer.from('# Café\n\nnaïve\n', 'latin1'));
    await scan();

    const tree = await api.get('/api/notes', NoteTreeSchema);
    const legacy = tree.notes.find((note) => note.path === 'Legacy.md');
    const latin = tree.notes.find((note) => note.path === 'Latin1.md');
    expect(legacy).toBeDefined();
    expect(latin).toBeDefined();
    for (const note of [legacy, latin]) {
      const detail = await api.get(`/api/notes/${note?.id}`, NoteDetailSchema);
      expect(detail.warnings.length).toBeGreaterThan(0);
      const refused = await harness?.request(`/api/notes/${note?.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '# Changed\n', baseHash: detail.hash }),
      });
      expect(refused?.status).toBeGreaterThanOrEqual(400);
      expect(refused?.status).toBeLessThan(500);
    }
    // Not one byte of either file changed.
    expect(readFileSync(abs('Legacy.md')).equals(utf16)).toBe(true);
    expect(readFileSync(abs('Latin1.md')).equals(Buffer.from('# Café\n\nnaïve\n', 'latin1'))).toBe(
      true,
    );
  });
});

describe('a file that cannot be written to', () => {
  it.runIf(process.platform === 'win32')(
    'says it is read-only — not that it changed on disk — and leaves it as it was',
    async () => {
      const { api, write, abs, scan } = await open();
      write('Locked.md', '# Locked\n\nOriginal.\n');
      await scan();
      const tree = await api.get('/api/notes', NoteTreeSchema);
      const note = tree.notes.find((entry) => entry.path === 'Locked.md');
      const detail = await api.get(`/api/notes/${note?.id}`, NoteDetailSchema);
      chmodSync(abs('Locked.md'), 0o444);
      try {
        const response = await harness?.request(`/api/notes/${note?.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: '# Locked\n\nChanged.\n', baseHash: detail.hash }),
        });
        expect(response?.status).toBe(423);
        const problem = ProblemDetailsSchema.parse(await response?.json());
        expect(problem.code).toBe('locked');
        expect(problem.detail).toMatch(/read-only/u);
        expect(readFileSync(abs('Locked.md'), 'utf8')).toBe('# Locked\n\nOriginal.\n');
      } finally {
        chmodSync(abs('Locked.md'), 0o666);
        expect(statSync(abs('Locked.md')).isFile()).toBe(true);
      }
    },
  );
});
