import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BookmarksSchema,
  copyEntryEndpoint,
  getVersionEndpoint,
  keepVersionEndpoint,
  listVersionsEndpoint,
  mergeNoteEndpoint,
  NoteDetailSchema,
  NoteTreeSchema,
  ProblemDetailsSchema,
  TrashItemSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from '../../../test/helpers';
import { FixedClock } from '../../shared/clock';

/** Phase 23: copies, merges, version history and bookmarks (tasks 23.06–23.07). */

let harness: ReturnType<typeof createTestApp>;
let clock: FixedClock;
afterEach(() => harness?.cleanup());

async function setUp(files: Record<string, string> = {}) {
  clock = new FixedClock('2026-10-11T09:00:00.000Z');
  harness = createTestApp({ clock });
  for (const [relative, content] of Object.entries(files)) write(relative, content);
  await harness.modules.start({ watch: false });
}

function write(relative: string, content: string | Uint8Array) {
  const file = path.join(harness.ctx.vault.root, ...relative.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const read = (relative: string) =>
  readFileSync(path.join(harness.ctx.vault.root, ...relative.split('/')), 'utf8');
const exists = (relative: string) =>
  existsSync(path.join(harness.ctx.vault.root, ...relative.split('/')));

async function call<T extends z.ZodType>(
  schema: T,
  method: string,
  url: string,
  body?: unknown,
  expectedStatus = 200,
): Promise<z.output<T>> {
  const response = await harness.request(url, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const json: unknown = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${url} returned ${response.status}: ${JSON.stringify(json)}`);
  }
  return schema.parse(json);
}

const tree = () => call(NoteTreeSchema, 'GET', '/api/notes');
const idByPath = async (notePath: string) => {
  const note = (await tree()).notes.find((entry) => entry.path === notePath);
  if (!note) throw new Error(`${notePath} is not in the tree`);
  return note.id;
};
const save = async (id: string, content: string) => {
  const current = await call(NoteDetailSchema, 'GET', `/api/notes/${id}`);
  return call(NoteDetailSchema, 'PUT', `/api/notes/${id}`, { content, baseHash: current.hash });
};

describe('the tree', () => {
  it('sends when each note was created, from its frontmatter when it says', async () => {
    await setUp({ 'Old.md': '---\ncreated: 2024-03-01\n---\nOld', 'New.md': 'New' });
    const notes = (await tree()).notes;
    expect(notes.find((note) => note.path === 'Old.md')?.createdAt).toMatch(/^2024-03-01/);
    expect(notes.find((note) => note.path === 'New.md')?.createdAt).toMatch(/^\d{4}-/);
  });
});

describe('making a copy', () => {
  it('copies a note beside it without its id, and an attachment byte for byte', async () => {
    await setUp({
      'Week 1/Paxos.md':
        '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\ntags: [consensus]\n---\n# Paxos',
      'Attachments/diagram.png': 'png-bytes',
    });
    const original = await idByPath('Week 1/Paxos.md');
    const copy = await call(
      copyEntryEndpoint.schemas.response,
      'POST',
      '/api/entries/copy',
      { path: 'Week 1/Paxos.md' },
      201,
    );
    expect(copy.path).toBe('Week 1/Paxos 1.md');
    expect(copy.noteId).not.toBeNull();
    expect(copy.noteId).not.toBe(original);
    expect(read('Week 1/Paxos 1.md')).toBe('---\ntags: [consensus]\n---\n# Paxos');
    expect(await idByPath('Week 1/Paxos.md')).toBe(original);

    const again = await call(
      copyEntryEndpoint.schemas.response,
      'POST',
      '/api/entries/copy',
      { path: 'Week 1/Paxos.md' },
      201,
    );
    expect(again.path).toBe('Week 1/Paxos 2.md');

    const attachment = await call(
      copyEntryEndpoint.schemas.response,
      'POST',
      '/api/entries/copy',
      { path: 'Attachments/diagram.png' },
      201,
    );
    expect(attachment).toEqual({ path: 'Attachments/diagram 1.png', noteId: null });
    expect(read('Attachments/diagram 1.png')).toBe('png-bytes');
  });

  it('refuses folders and paths that are not in the vault', async () => {
    await setUp({ 'Week 1/Paxos.md': '# Paxos' });
    await call(ProblemDetailsSchema, 'POST', '/api/entries/copy', { path: 'Week 1' }, 400);
    await call(ProblemDetailsSchema, 'POST', '/api/entries/copy', { path: 'Nope.md' }, 404);
  });
});

describe('merging', () => {
  it('appends the body, retargets links (keeping headings) and trashes the merged note', async () => {
    await setUp({
      'Raft.md': '# Raft\nLeader election.\n',
      'Notes/Log replication.md':
        '---\ntags: [raft]\n---\n## Entries\nSee [[Log replication#Entries]] and [notes](../Raft.md).',
      'Index.md': 'Read [[Log replication]] then [[Log replication#Entries|the entries]].',
      'Elsewhere/Other.md': '[log](../Notes/Log%20replication.md)',
    });
    const source = await idByPath('Notes/Log replication.md');
    const target = await idByPath('Raft.md');
    const result = await call(
      mergeNoteEndpoint.schemas.response,
      'POST',
      `/api/notes/${source}/merge`,
      {
        targetId: target,
      },
    );
    expect(result.target.id).toBe(target);
    expect(result.retargeted).toEqual({ notes: 2, links: 3 });
    expect(result.failed).toEqual([]);

    expect(read('Raft.md')).toBe(
      '# Raft\nLeader election.\n\n## Entries\nSee [[Raft#Entries]] and [notes](Raft.md).',
    );
    expect(read('Index.md')).toBe('Read [[Raft]] then [[Raft#Entries|the entries]].');
    expect(read('Elsewhere/Other.md')).toBe('[log](../Raft.md)');
    expect(exists('Notes/Log replication.md')).toBe(false);

    const trash = await call(z.object({ items: z.array(TrashItemSchema) }), 'GET', '/api/trash');
    expect(trash.items.map((item) => item.id)).toContain(result.trashId);

    const versions = await call(
      listVersionsEndpoint.schemas.response,
      'GET',
      `/api/notes/${target}/versions`,
    );
    expect(versions.versions).toHaveLength(1);
    expect(versions.versions[0]?.reason).toBe('merge');
  });

  it('refuses to merge a note with itself', async () => {
    await setUp({ 'Raft.md': '# Raft' });
    const id = await idByPath('Raft.md');
    await call(ProblemDetailsSchema, 'POST', `/api/notes/${id}/merge`, { targetId: id }, 400);
  });
});

describe('version history', () => {
  it('keeps the replaced text at most every five minutes, newest first, and reads it back', async () => {
    await setUp({ 'Paxos.md': 'one' });
    const id = await idByPath('Paxos.md');
    await save(id, 'two');
    clock.advance(60_000);
    await save(id, 'three');
    let list = await call(
      listVersionsEndpoint.schemas.response,
      'GET',
      `/api/notes/${id}/versions`,
    );
    expect(list.versions.map((version) => version.reason)).toEqual(['save']);
    expect(list.retentionDays).toBe(30);

    clock.advance(5 * 60_000);
    await save(id, 'four');
    list = await call(listVersionsEndpoint.schemas.response, 'GET', `/api/notes/${id}/versions`);
    expect(list.versions).toHaveLength(2);
    const [newest, oldest] = list.versions;
    expect(Date.parse(newest?.savedAt ?? '')).toBeGreaterThan(Date.parse(oldest?.savedAt ?? ''));

    const read = (versionId: string) =>
      call(getVersionEndpoint.schemas.response, 'GET', `/api/notes/${id}/versions/${versionId}`);
    expect((await read(newest?.id ?? '')).content).toBe('three');
    expect((await read(oldest?.id ?? '')).content).toBe('one');
  });

  it('keeps a version on request before a restore, and forgets versions after 30 days', async () => {
    await setUp({ 'Paxos.md': 'one' });
    const id = await idByPath('Paxos.md');
    const kept = await call(
      keepVersionEndpoint.schemas.response,
      'POST',
      `/api/notes/${id}/versions`,
      undefined,
      201,
    );
    expect(kept.version?.reason).toBe('restore');

    clock.advance(31 * 24 * 60 * 60_000);
    await save(id, 'two');
    const list = await call(
      listVersionsEndpoint.schemas.response,
      'GET',
      `/api/notes/${id}/versions`,
    );
    expect(list.versions.map((version) => version.reason)).toEqual(['save']);
  });

  it('answers 404 for a version that is not kept and 400 for a malformed id', async () => {
    await setUp({ 'Paxos.md': 'one' });
    const id = await idByPath('Paxos.md');
    await call(
      ProblemDetailsSchema,
      'GET',
      `/api/notes/${id}/versions/20261011T090000000Z-save`,
      undefined,
      404,
    );
    await call(
      ProblemDetailsSchema,
      'GET',
      `/api/notes/${id}/versions/..%2F..%2Fskb.db`,
      undefined,
      400,
    );
  });
});

describe('bookmarks', () => {
  it('are kept without duplicates and follow their files when moved or merged', async () => {
    await setUp({ 'Week 1/Paxos.md': '# Paxos', 'Raft.md': '# Raft', 'Week 1/Lab.md': 'Lab' });
    const saved = await call(BookmarksSchema, 'PUT', '/api/bookmarks', {
      items: [
        { path: 'Week 1/Paxos.md', kind: 'note' },
        { path: 'Week 1/Paxos.md', kind: 'note' },
        { path: 'Week 1', kind: 'folder' },
        { path: 'Week 1/Lab.md', kind: 'note' },
      ],
    });
    expect(saved.items).toHaveLength(3);

    await call(z.unknown(), 'POST', '/api/entries/move', {
      from: 'Week 1',
      to: 'Week 01',
      rewriteLinks: true,
    });
    const lab = await idByPath('Week 01/Lab.md');
    await call(mergeNoteEndpoint.schemas.response, 'POST', `/api/notes/${lab}/merge`, {
      targetId: await idByPath('Raft.md'),
    });
    const after = await call(BookmarksSchema, 'GET', '/api/bookmarks');
    expect(after.items).toEqual([
      { path: 'Week 01/Paxos.md', kind: 'note' },
      { path: 'Week 01', kind: 'folder' },
      { path: 'Raft.md', kind: 'note' },
    ]);
  });
});
