import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BacklinkSchema,
  fileUrl,
  MovePreviewSchema,
  NoteDetailSchema,
  NotesSettingsSchema,
  NoteTreeSchema,
  ProblemDetailsSchema,
  TrashItemSchema,
  UnlinkedMentionSchema,
  UploadedAttachmentSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from '../../../test/helpers';

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());

async function setUp(files: Record<string, string> = {}) {
  harness = createTestApp();
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

const problem = (method: string, url: string, body: unknown, status: number) =>
  call(ProblemDetailsSchema, method, url, body, status);

const idByPath = async (notePath: string) => {
  const tree = await call(NoteTreeSchema, 'GET', '/api/notes');
  const note = tree.notes.find((entry) => entry.path === notePath);
  if (!note) throw new Error(`${notePath} is not in the tree`);
  return note.id;
};

describe('notes API', () => {
  it('lists the tree and reads a note with its outline and resolved links', async () => {
    await setUp({
      'Paxos.md':
        '---\ntags: [consensus]\naliases: [Synod]\n---\n# Paxos\n## Safety\nSee [[Raft#Log|the log]] and ![[diagram.png]] and [[Missing]].',
      'Modules/Raft.md': '# Raft',
      'Attachments/diagram.png': 'png',
      'Empty/.keep': '',
    });
    const tree = await call(NoteTreeSchema, 'GET', '/api/notes');
    expect(tree.notes.map((note) => note.path)).toEqual(['Modules/Raft.md', 'Paxos.md']);
    expect(tree.folders).toEqual(['Attachments', 'Empty', 'Modules']);
    expect(tree.attachments.map((attachment) => [attachment.path, attachment.mediaType])).toEqual([
      ['Attachments/diagram.png', 'image/png'],
    ]);
    expect(tree.index.state).toBe('ready');

    const paxos = await call(NoteDetailSchema, 'GET', `/api/notes/${await idByPath('Paxos.md')}`);
    expect(paxos).toMatchObject({
      title: 'Paxos',
      aliases: ['Synod'],
      tags: ['consensus'],
      idPersisted: false,
    });
    expect(paxos.headings.map((heading) => [heading.level, heading.text, heading.slug])).toEqual([
      [1, 'Paxos', 'paxos'],
      [2, 'Safety', 'safety'],
    ]);
    expect(paxos.links.map((link) => [link.target, link.heading, link.resolution.kind])).toEqual([
      ['Raft', 'Log', 'note'],
      ['diagram.png', null, 'attachment'],
      ['Missing', null, 'unresolved'],
    ]);
  });

  it('creates notes with unique, safe file names and from templates', async () => {
    await setUp({
      'Templates/Lecture.md':
        '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\ntype: lecture-notes\n---\n# {{title}}\nModule: {{module}}',
    });
    const first = await call(
      NoteDetailSchema,
      'POST',
      '/api/notes',
      { folder: 'Inbox', title: 'Paxos: why?' },
      201,
    );
    expect(first.path).toBe('Inbox/Paxos- why-.md');
    expect(first.title).toBe('Paxos: why?');
    expect(read('Inbox/Paxos- why-.md')).toBe('---\ntitle: "Paxos: why?"\n---\n');

    const second = await call(
      NoteDetailSchema,
      'POST',
      '/api/notes',
      { folder: 'Inbox', title: 'Paxos: why?' },
      201,
    );
    expect(second.path).toBe('Inbox/Paxos- why- 1.md');

    const templates = await call(
      z.object({ folder: z.string(), templates: z.array(z.object({ id: z.string() })) }),
      'GET',
      '/api/templates',
    );
    const fromTemplate = await call(
      NoteDetailSchema,
      'POST',
      '/api/notes',
      { title: 'Lecture 3', templateId: templates.templates[0]?.id, module: 'COC251' },
      201,
    );
    expect(read('Lecture 3.md')).toBe(
      '---\ntype: lecture-notes\nmodule: COC251\n---\n# Lecture 3\nModule: COC251',
    );
    expect(fromTemplate.id).not.toBe('note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7');

    await problem('POST', '/api/notes', { folder: '.obsidian' }, 400);
    await problem('POST', '/api/notes', { folder: '../outside' }, 400);
    await problem('POST', '/api/notes', { folder: 'Sources/COC251' }, 400);
    await problem('POST', '/api/notes', { title: 'x', templateId: first.id }, 400);
  });

  it('saves with conflict detection and never overwrites an external edit', async () => {
    await setUp({ 'A.md': 'version 1' });
    const id = await idByPath('A.md');
    const opened = await call(NoteDetailSchema, 'GET', `/api/notes/${id}`);
    const saved = await call(NoteDetailSchema, 'PUT', `/api/notes/${id}`, {
      content: 'version 2',
      baseHash: opened.hash,
    });
    expect(read('A.md')).toBe('version 2');
    expect(saved.hash).not.toBe(opened.hash);

    write('A.md', 'edited in another program');
    const conflict = await problem(
      'PUT',
      `/api/notes/${id}`,
      { content: 'my edit', baseHash: saved.hash },
      409,
    );
    expect(conflict.details).toMatchObject({ reason: 'changed', currentHash: expect.any(String) });
    expect(read('A.md')).toBe('edited in another program');

    const reloaded = await call(NoteDetailSchema, 'GET', `/api/notes/${id}`);
    expect(reloaded.content).toBe('edited in another program');
    expect(reloaded.hash).toBe(conflict.details?.currentHash);
  });

  it('keeps byte-order marks and refuses to edit files that are not UTF-8', async () => {
    await setUp({ 'Bom.md': '﻿# Title\r\n' });
    write('Latin1.md', new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    await harness.modules.notes.indexer.scan();
    const bom = await call(NoteDetailSchema, 'GET', `/api/notes/${await idByPath('Bom.md')}`);
    expect(bom.content).toBe('﻿# Title\r\n');
    const latin = await call(NoteDetailSchema, 'GET', `/api/notes/${await idByPath('Latin1.md')}`);
    expect(latin.warnings.map((warning) => warning.code)).toEqual(['not-utf8']);
    await problem('PUT', `/api/notes/${latin.id}`, { content: 'x', baseHash: latin.hash }, 400);
  });

  it('lists backlinks and unlinked mentions, and links a mention', async () => {
    await setUp({
      'Raft.md': '---\naliases: [Raft consensus]\n---\n# Raft',
      'Linked.md': 'Uses [[Raft]] heavily.\nAnother [[Raft#Safety|mention]].',
      'Plain.md': 'Raft consensus is easier than Paxos.\n| table | Raft |',
      'Code.md': '`Raft` only in code',
    });
    const raftId = await idByPath('Raft.md');
    const backlinks = await call(
      z.object({ linked: z.array(BacklinkSchema) }),
      'GET',
      `/api/notes/${raftId}/backlinks`,
    );
    expect(backlinks.linked).toHaveLength(1);
    expect(backlinks.linked[0]?.mentions.map((mention) => mention.context)).toEqual([
      'Uses [[Raft]] heavily.',
      'Another [[Raft#Safety|mention]].',
    ]);

    const unlinked = await call(
      z.object({ mentions: z.array(UnlinkedMentionSchema), truncated: z.boolean() }),
      'GET',
      `/api/notes/${raftId}/unlinked-mentions`,
    );
    expect(unlinked.mentions.map((mention) => mention.source.path)).toEqual(['Plain.md']);
    const [first, second] = unlinked.mentions[0]?.matches ?? [];
    expect([first?.text, second?.text]).toEqual(['Raft consensus', 'Raft']);

    const body = {
      sourceId: unlinked.mentions[0]?.source.id,
      sourceHash: unlinked.mentions[0]?.sourceHash,
      offset: second?.offset,
      text: second?.text,
    };
    const linked = await call(
      z.object({ link: z.string() }),
      'POST',
      `/api/notes/${raftId}/link-mention`,
      body,
    );
    expect(linked.link).toBe('[[Raft]]');
    expect(read('Plain.md')).toBe('Raft consensus is easier than Paxos.\n| table | [[Raft]] |');
    // The hash is stale now, so repeating the request is refused.
    await problem('POST', `/api/notes/${raftId}/link-mention`, body, 409);

    const tags = await call(
      z.object({ tags: z.array(z.object({ tag: z.string() })) }),
      'GET',
      '/api/tags',
    );
    expect(tags.tags).toEqual([]);
  });

  it('returns 404 for unknown notes and 400 for malformed ids', async () => {
    await setUp();
    await problem('GET', '/api/notes/note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', undefined, 404);
    await problem('GET', '/api/notes/not-an-id', undefined, 400);
  });
});

describe('entries API: moves, folders and the trash', () => {
  it('previews and applies a rename, rewriting links that would otherwise break', async () => {
    await setUp({
      'Notes/Paxos.md': '# Paxos\nSee [[Raft]].',
      'Notes/Raft.md': '# Raft',
      'Index.md':
        'Links: [[Paxos]], [[Paxos#Safety|safety]], [md](Notes/Paxos.md), [[Notes/Paxos]].',
      'Other/Paxos.md': '# Another note named Paxos',
    });
    const preview = await call(MovePreviewSchema, 'POST', '/api/entries/move-preview', {
      from: 'Notes/Paxos.md',
      to: 'Archive/Basic Paxos.md',
    });
    expect(preview.kind).toBe('note');
    expect(preview.rewrites.map((rewrite) => [rewrite.source.path, rewrite.links])).toEqual([
      ['Index.md', 4],
    ]);

    const id = await idByPath('Notes/Paxos.md');
    const result = await call(
      z.object({
        noteId: z.string().nullable(),
        rewritten: z.object({ notes: z.number(), links: z.number() }),
      }),
      'POST',
      '/api/entries/move',
      { from: 'Notes/Paxos.md', to: 'Archive/Basic Paxos.md', rewriteLinks: true },
    );
    expect(result).toMatchObject({ noteId: id, rewritten: { notes: 1, links: 4 } });
    expect(read('Index.md')).toBe(
      'Links: [[Basic Paxos]], [[Basic Paxos#Safety|safety]], [md](Archive/Basic%20Paxos.md), [[Basic Paxos]].',
    );
    // The moved note keeps its id, and its own link still resolves from the new folder.
    const moved = await call(NoteDetailSchema, 'GET', `/api/notes/${id}`);
    expect(moved.path).toBe('Archive/Basic Paxos.md');
    expect(moved.links[0]?.resolution).toMatchObject({ kind: 'note', path: 'Notes/Raft.md' });
  });

  it('rewrites links to a renamed note whose title comes from its file name', async () => {
    await setUp({ 'Rename target.md': '# Target', 'Source.md': 'Points at [[Rename target]].' });
    const preview = await call(MovePreviewSchema, 'POST', '/api/entries/move-preview', {
      from: 'Rename target.md',
      to: 'Renamed target.md',
    });
    expect(preview.rewrites.map((rewrite) => rewrite.source.path)).toEqual(['Source.md']);
    await call(z.unknown(), 'POST', '/api/entries/move', {
      from: 'Rename target.md',
      to: 'Renamed target.md',
      rewriteLinks: true,
    });
    expect(read('Source.md')).toBe('Points at [[Renamed target]].');
  });

  it('keeps links that still resolve by a frontmatter title', async () => {
    await setUp({
      'Old name.md': '---\ntitle: Paxos made simple\n---\n',
      'Source.md': '[[Paxos made simple]]',
    });
    const preview = await call(MovePreviewSchema, 'POST', '/api/entries/move-preview', {
      from: 'Old name.md',
      to: 'New name.md',
    });
    expect(preview.rewrites).toEqual([]);
  });

  it('moves folders with their notes and attachments, rewriting only links that would break', async () => {
    await setUp({
      'Week 1/Lecture.md':
        'Diagram: ![[Week 1/img/flow.png]] and ![](img/flow.png); back to [index](../Index.md)',
      'Week 1/img/flow.png': 'png',
      'Index.md': '[[Week 1/Lecture]]',
    });
    const id = await idByPath('Week 1/Lecture.md');
    await call(z.unknown(), 'POST', '/api/entries/move', {
      from: 'Week 1',
      to: 'Modules/COC251/Week 1',
      rewriteLinks: true,
    });
    expect(await idByPath('Modules/COC251/Week 1/Lecture.md')).toBe(id);
    // Path-suffix and folder-relative links still resolve; only the link out of the folder changes.
    expect(read('Modules/COC251/Week 1/Lecture.md')).toBe(
      'Diagram: ![[Week 1/img/flow.png]] and ![](img/flow.png); back to [index](../../../Index.md)',
    );
    expect(read('Index.md')).toBe('[[Week 1/Lecture]]');
    const tree = await call(NoteTreeSchema, 'GET', '/api/notes');
    expect(tree.folders).toEqual([
      'Modules',
      'Modules/COC251',
      'Modules/COC251/Week 1',
      'Modules/COC251/Week 1/img',
    ]);
    expect(tree.attachments.map((attachment) => attachment.path)).toEqual([
      'Modules/COC251/Week 1/img/flow.png',
    ]);
  });

  it('can move without rewriting, and rejects invalid destinations', async () => {
    await setUp({ 'A.md': 'a', 'B.md': '[[A]]', 'Folder/C.md': 'c' });
    await call(z.unknown(), 'POST', '/api/entries/move', {
      from: 'A.md',
      to: 'Renamed.md',
      rewriteLinks: false,
    });
    expect(read('B.md')).toBe('[[A]]');
    await problem(
      'POST',
      '/api/entries/move',
      { from: 'Renamed.md', to: 'B.md', rewriteLinks: false },
      409,
    );
    await problem(
      'POST',
      '/api/entries/move',
      { from: 'Renamed.md', to: 'Renamed.txt', rewriteLinks: false },
      400,
    );
    await problem(
      'POST',
      '/api/entries/move',
      { from: 'Folder', to: 'Folder/Inner', rewriteLinks: false },
      400,
    );
    await problem(
      'POST',
      '/api/entries/move',
      { from: 'Renamed.md', to: '.skb/x.md', rewriteLinks: false },
      400,
    );
    await problem(
      'POST',
      '/api/entries/move',
      { from: 'Missing.md', to: 'X.md', rewriteLinks: false },
      404,
    );
  });

  it('allows a case-only rename', async () => {
    await setUp({ 'paxos.md': 'p' });
    const id = await idByPath('paxos.md');
    await call(z.unknown(), 'POST', '/api/entries/move', {
      from: 'paxos.md',
      to: 'Paxos.md',
      rewriteLinks: true,
    });
    expect(await idByPath('Paxos.md')).toBe(id);
  });

  it('creates folders and moves notes to the trash and back with the same id', async () => {
    await setUp({ 'Ideas/Idea.md': 'An idea', 'Index.md': '[[Idea]]' });
    await call(
      z.object({ path: z.string() }),
      'POST',
      '/api/folders',
      { path: 'Projects/2026' },
      201,
    );
    await problem('POST', '/api/folders', { path: 'Projects/2026' }, 409);
    let tree = await call(NoteTreeSchema, 'GET', '/api/notes');
    expect(tree.folders).toEqual(['Ideas', 'Projects', 'Projects/2026']);

    const id = await idByPath('Ideas/Idea.md');
    const item = await call(TrashItemSchema, 'POST', '/api/entries/trash', { path: 'Ideas' });
    expect(item).toMatchObject({ kind: 'folder', notes: 1, originalPath: 'Ideas' });
    expect(exists('Ideas')).toBe(false);
    tree = await call(NoteTreeSchema, 'GET', '/api/notes');
    expect(tree.notes.map((note) => note.path)).toEqual(['Index.md']);
    const index = await call(NoteDetailSchema, 'GET', `/api/notes/${await idByPath('Index.md')}`);
    expect(index.links[0]?.resolution.kind).toBe('unresolved');

    const trash = await call(
      z.object({ items: z.array(TrashItemSchema), retentionDays: z.number() }),
      'GET',
      '/api/trash',
    );
    expect(trash.items.map((entry) => entry.id)).toEqual([item.id]);
    expect(
      await call(z.object({ path: z.string() }), 'POST', `/api/trash/${item.id}/restore`),
    ).toEqual({ path: 'Ideas' });
    expect(await idByPath('Ideas/Idea.md')).toBe(id);
    const restored = await call(
      NoteDetailSchema,
      'GET',
      `/api/notes/${await idByPath('Index.md')}`,
    );
    expect(restored.links[0]?.resolution).toMatchObject({ kind: 'note', noteId: id });

    const again = await call(TrashItemSchema, 'POST', '/api/entries/trash', {
      path: 'Ideas/Idea.md',
    });
    await call(z.object({ ok: z.literal(true) }), 'DELETE', `/api/trash/${again.id}`);
    await problem('POST', `/api/trash/${again.id}/restore`, undefined, 404);
    await problem('POST', '/api/trash/not-an-id/restore', undefined, 400);
  });
});

describe('attachments and files', () => {
  async function upload(name: string, content: string, folder?: string) {
    const form = new FormData();
    form.append('file', new File([content], name, { type: 'application/octet-stream' }));
    if (folder) form.append('folder', folder);
    return harness.request('/api/attachments', { method: 'POST', body: form });
  }

  it('uploads attachments into the attachments folder with unique names', async () => {
    await setUp();
    const first = UploadedAttachmentSchema.parse(
      await (await upload('flow chart.png', 'one')).json(),
    );
    expect(first).toMatchObject({
      path: 'Attachments/flow chart.png',
      embed: '![[flow chart.png]]',
      mediaType: 'image/png',
    });
    const second = await upload('flow chart.png', 'two');
    expect(second.status).toBe(201);
    expect(UploadedAttachmentSchema.parse(await second.json()).path).toBe(
      'Attachments/flow chart 1.png',
    );
    const custom = UploadedAttachmentSchema.parse(
      await (await upload('../../evil?.pdf', 'pdf', 'Modules/COC251')).json(),
    );
    expect(custom.path).toBe('Modules/COC251/evil-.pdf');
    expect((await upload('note.md', '# no')).status).toBe(400);
    const tree = await call(NoteTreeSchema, 'GET', '/api/notes');
    expect(tree.attachments).toHaveLength(3);
  });

  it('serves vault files with safe headers, ranges and caching, but never application files', async () => {
    await setUp({
      'Attachments/a b.png': 'abcdefghij',
      'Drawing.svg': '<svg/>',
      'Paper.pdf': '%PDF',
    });
    const response = await harness.request(fileUrl('Attachments/a b.png'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('abcdefghij');

    const range = await harness.request(fileUrl('Attachments/a b.png'), {
      headers: { range: 'bytes=2-4' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await range.text()).toBe('cde');
    const suffix = await harness.request(fileUrl('Attachments/a b.png'), {
      headers: { range: 'bytes=-3' },
    });
    expect(await suffix.text()).toBe('hij');
    expect(
      (await harness.request(fileUrl('Attachments/a b.png'), { headers: { range: 'bytes=20-' } }))
        .status,
    ).toBe(416);

    const cached = await harness.request(fileUrl('Attachments/a b.png'), {
      headers: { 'if-none-match': response.headers.get('etag') ?? '' },
    });
    expect(cached.status).toBe(304);

    expect(
      (await harness.request(fileUrl('Paper.pdf'))).headers.get('content-security-policy'),
    ).not.toContain('sandbox');
    expect(
      (await harness.request(fileUrl('Drawing.svg'))).headers.get('content-security-policy'),
    ).toContain('sandbox');
    expect((await harness.request('/api/files/.skb/skb.db')).status).toBe(400);
    expect((await harness.request('/api/files/.skb/vault.json')).status).toBe(400);
    write('.obsidian/app.json', '{}');
    expect((await harness.request('/api/files/.obsidian/app.json')).status).toBe(404);
    expect((await harness.request('/api/files/..%2F..%2Fsecret.txt')).status).toBe(400);
    expect((await harness.request('/api/files/Missing.png')).status).toBe(404);
    expect((await harness.request(fileUrl('Attachments/a b.png'), { auth: 'none' })).status).toBe(
      401,
    );
  });
});

describe('settings and events', () => {
  it('reads and validates notes settings', async () => {
    await setUp();
    const settings = await call(NotesSettingsSchema, 'GET', '/api/settings/notes');
    expect(settings.assignIds).toBe('on-demand');
    const updated = await call(NotesSettingsSchema, 'PUT', '/api/settings/notes', {
      assignIds: 'on-index',
    });
    expect(updated.assignIds).toBe('on-index');
    await problem('PUT', '/api/settings/notes', { trashRetentionDays: 0 }, 400);
  });

  it('streams vault changes to subscribers', async () => {
    await setUp();
    const response = await harness.request('/api/events');
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('no body');
    const decoder = new TextDecoder();
    const readUntil = async (marker: string) => {
      let text = '';
      while (!text.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      return text;
    };
    expect(await readUntil('event: hello')).toContain('"type":"hello"');
    await call(NoteDetailSchema, 'POST', '/api/notes', { title: 'Streamed' }, 201);
    const text = await readUntil('Streamed.md');
    expect(text).toContain('event: vault.changed');
    expect(text).toContain('"origin":"app"');
    await reader.cancel();
  });
});
