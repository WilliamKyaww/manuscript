import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NoteDetailSchema, NoteTreeSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OBSIDIAN_RESOLUTION, OBSIDIAN_VAULT } from './fixtures/obsidian-vault';
import { createTestApp } from './helpers';

/**
 * Task 3.21: opening an Obsidian vault must not change it. With the default settings no file is
 * touched at all; with `assignIds: on-index` the only change is an added id line.
 */

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());

function writeFixture(root: string) {
  for (const [relative, content] of Object.entries(OBSIDIAN_VAULT)) {
    const file = path.join(root, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

/** Every file outside .skb with its bytes. */
function snapshot(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (relative !== '.skb') walk(full);
      } else {
        files.set(relative, readFileSync(full));
      }
    }
  };
  walk(root);
  return files;
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function get<T extends z.ZodType>(schema: T, url: string): Promise<z.output<T>> {
  const response = await harness.request(url);
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

async function openEverything() {
  const tree = await get(NoteTreeSchema, '/api/notes');
  for (const note of tree.notes) {
    await get(NoteDetailSchema, `/api/notes/${note.id}`);
    await get(z.unknown(), `/api/notes/${note.id}/backlinks`);
    await get(z.unknown(), `/api/notes/${note.id}/unlinked-mentions`);
  }
  await get(z.unknown(), '/api/tags');
  await get(z.unknown(), '/api/templates');
  return tree;
}

describe('Obsidian compatibility', () => {
  it('indexes an Obsidian vault and reads every note without changing a single file', async () => {
    harness = createTestApp();
    const root = harness.ctx.vault.root;
    writeFixture(root);
    const before = snapshot(root);
    await harness.modules.start({ watch: false });
    const tree = await openEverything();

    const after = snapshot(root);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [file, bytes] of before)
      expect(sha(after.get(file) ?? Buffer.alloc(0)), file).toBe(sha(bytes));

    // Obsidian's own folders, its trash and canvas files are not notes.
    expect(tree.notes.map((note) => note.path).sort()).toEqual([
      'COC251/CAP theorem.md',
      'COC251/Overview.md',
      'COC251/Raft.md',
      'Consensus.md',
      'Home.md',
      'Inbox/Broken frontmatter.md',
      'Inbox/Latin-1.md',
      'Templates/Lecture.md',
    ]);
    expect(tree.attachments.map((attachment) => attachment.path).sort()).toEqual([
      'Attachments/diagram.png',
      'Drawings/Plan.canvas',
    ]);
  });

  it('resolves links the way Obsidian does', async () => {
    harness = createTestApp();
    writeFixture(harness.ctx.vault.root);
    await harness.modules.start({ watch: false });
    const tree = await get(NoteTreeSchema, '/api/notes');
    const home = tree.notes.find((note) => note.path === 'Home.md');
    const detail = await get(NoteDetailSchema, `/api/notes/${home?.id}`);
    const resolved = Object.fromEntries(
      detail.links.map((link) => [
        link.target,
        link.resolution.kind === 'unresolved' ? null : link.resolution.path,
      ]),
    );
    for (const [target, expected] of Object.entries(OBSIDIAN_RESOLUTION)) {
      expect(resolved[target], target).toBe(expected);
    }
    // Links inside comments and code are not links; neither are tags in code.
    expect(Object.keys(resolved)).not.toContain('Not a link');
    expect(Object.keys(resolved)).not.toContain('Nope');
    expect(detail.tags).toEqual(['cs/distributed', 'exam/week-3', 'index']);
    // A block reference and a heading both point at the note.
    expect(
      detail.links
        .filter((link) => link.target === 'Consensus')
        .map((link) => [link.heading, link.blockRef]),
    ).toEqual([
      ['Paxos', null],
      [null, 'summary-block'],
      ['Paxos', null],
    ]);
  });

  it('when told to assign ids to every note, adds only an id line', async () => {
    harness = createTestApp();
    const root = harness.ctx.vault.root;
    writeFixture(root);
    const before = snapshot(root);
    harness.modules.settings.updateNotes({ assignIds: 'on-index' });
    await harness.modules.start({ watch: false });
    await openEverything();
    const after = snapshot(root);

    const changed = [...before.keys()].filter(
      (file) =>
        sha(before.get(file) ?? Buffer.alloc(0)) !== sha(after.get(file) ?? Buffer.alloc(0)),
    );
    expect(changed.sort()).toEqual([
      'COC251/CAP theorem.md',
      'COC251/Overview.md',
      'COC251/Raft.md',
      'Consensus.md',
      'Home.md',
      'Templates/Lecture.md',
    ]);
    for (const file of changed) {
      const original = before.get(file)?.toString('utf8') ?? '';
      const updated = after.get(file)?.toString('utf8') ?? '';
      // Removing the added line (or the frontmatter block that holds only it) gives back the original.
      const withoutId = updated
        .replace(/^(﻿?)---(\r?\n)(?:skb-)?id: note_[0-9A-HJKMNP-TV-Z]{26}\r?\n---\r?\n/, '$1')
        .replace(/^(﻿?---\r?\n)(?:skb-)?id: note_[0-9A-HJKMNP-TV-Z]{26}\r?\n/, '$1');
      expect(withoutId, file).toBe(original);
    }
    // A Zettelkasten id is kept; the app uses skb-id beside it.
    expect(after.get('Consensus.md')?.toString('utf8')).toMatch(
      /^---\nskb-id: note_\w{26}\nid: 202310041305\n/,
    );
    // Invalid YAML and non-UTF-8 files are never touched.
    expect(after.get('Inbox/Broken frontmatter.md')).toEqual(
      before.get('Inbox/Broken frontmatter.md'),
    );
    expect(after.get('Inbox/Latin-1.md')).toEqual(before.get('Inbox/Latin-1.md'));
  });
});
