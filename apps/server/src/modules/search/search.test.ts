import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ProblemDetailsSchema, SearchResponseSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from '../../../test/helpers';
import { firstMatchingLine, toParts } from './service';

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());

const VAULT = {
  'Modules/COC251/Raft.md':
    '---\ntags: [exam, cs/distributed]\ntype: lecture-notes\nmodule: COC251\naliases: [Raft algorithm]\n---\n# Raft\nIntro line.\nLeader election uses randomised timeouts.\n## Log replication\nEntries are replicated by the leader.',
  'Modules/COC251/Paxos.md':
    '---\ntags: [cs/distributed]\ntype: lecture-notes\nmodule: COC251\n---\n# Paxos\nPaxos reaches consensus despite failures; a leader is optional. Compared with Raft.',
  'Modules/COC254/Gradient descent.md':
    '---\ntags: [exam, ml]\ntype: summary\nmodule: COC254\n---\n# Gradient descent\nThe learning rate controls the step size. Elections are unrelated.',
  'Week 1/Café notes.md': '# Café notes\nWe discussed the café problem and Byzantine generals.',
  'Inbox/Draft.md':
    '---\ntags: [draft]\n---\nA draft mentioning the leader briefly. raft raft raft',
};

async function setUp() {
  harness = createTestApp();
  for (const [relative, content] of Object.entries(VAULT)) {
    const file = path.join(harness.ctx.vault.root, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  await harness.modules.start({ watch: false });
}

async function search(q: string, extra = '') {
  const response = await harness.request(`/api/search?q=${encodeURIComponent(q)}${extra}`);
  expect(response.status, q).toBe(200);
  return SearchResponseSchema.parse(await response.json());
}

const paths = async (q: string) => (await search(q)).results.map((result) => result.note.path);

describe('search', () => {
  it('ranks title matches above body matches and returns highlighted snippets', async () => {
    await setUp();
    const result = await search('leader');
    expect(result.results.map((entry) => entry.note.path).sort()).toEqual([
      'Inbox/Draft.md',
      'Modules/COC251/Paxos.md',
      'Modules/COC251/Raft.md',
    ]);
    const raft = result.results.find((entry) => entry.note.path === 'Modules/COC251/Raft.md');
    expect(
      raft?.snippet.some((part) => part.match && part.text.toLowerCase().startsWith('leader')),
    ).toBe(true);
    expect(raft?.line).toBe(9);
    expect(result.total).toBe(3);
    expect(result.highlights).toEqual(['leader']);

    // The title weighs more than a short note repeating the word.
    const titled = await search('raft');
    expect(titled.results.map((entry) => entry.note.path)[0]).toBe('Modules/COC251/Raft.md');
    expect(titled.results).toHaveLength(3);
    expect(titled.results[0]?.title).toEqual([{ text: 'Raft', match: true }]);
  });

  it('matches prefixes, stems, accents, phrases, OR and exclusions', async () => {
    await setUp();
    expect(await paths('replic')).toEqual(['Modules/COC251/Raft.md']);
    expect((await paths('election')).sort()).toEqual([
      'Modules/COC251/Raft.md',
      'Modules/COC254/Gradient descent.md',
    ]);
    expect(await paths('cafe')).toEqual(['Week 1/Café notes.md']);
    expect(await paths('"leader election"')).toEqual(['Modules/COC251/Raft.md']);
    expect((await paths('paxos OR gradient')).sort()).toEqual([
      'Modules/COC251/Paxos.md',
      'Modules/COC254/Gradient descent.md',
    ]);
    expect(await paths('leader -replicated -draft')).toEqual(['Modules/COC251/Paxos.md']);
    // Aliases are searchable with the title's weight.
    expect((await paths('algorithm'))[0]).toBe('Modules/COC251/Raft.md');
  });

  it('filters by tag (including nested tags), type, folder and module, and lets filters compose', async () => {
    await setUp();
    expect((await paths('tag:cs')).sort()).toEqual([
      'Modules/COC251/Paxos.md',
      'Modules/COC251/Raft.md',
    ]);
    expect(await paths('leader tag:exam')).toEqual(['Modules/COC251/Raft.md']);
    expect(await paths('tag:exam tag:ml')).toEqual(['Modules/COC254/Gradient descent.md']);
    expect(await paths('type:summary')).toEqual(['Modules/COC254/Gradient descent.md']);
    expect((await paths('folder:modules/coc251')).sort()).toEqual([
      'Modules/COC251/Paxos.md',
      'Modules/COC251/Raft.md',
    ]);
    expect(await paths('folder:"Week 1"')).toEqual(['Week 1/Café notes.md']);
    expect(await paths('module:coc251 -tag:exam')).toEqual(['Modules/COC251/Paxos.md']);
    expect((await paths('#exam')).length).toBe(2);
    expect((await paths('leader folder:Modules')).sort()).toEqual([
      'Modules/COC251/Paxos.md',
      'Modules/COC251/Raft.md',
    ]);
    // A filter-only search returns the body start as context and no line.
    const filtered = await search('type:summary');
    expect(filtered.results[0]?.line).toBeNull();
    expect(filtered.results[0]?.snippet[0]?.text).toContain('Gradient descent');
  });

  it('pages through results', async () => {
    await setUp();
    const first = await search('leader', '&limit=2');
    const second = await search('leader', '&limit=2&offset=2');
    expect(first.results).toHaveLength(2);
    expect(second.results).toHaveLength(1);
    const all = [...first.results, ...second.results].map((entry) => entry.note.path);
    expect(new Set(all).size).toBe(3);
    expect(first.total).toBe(3);
  });

  it('stops counting after 1,000 matches but keeps paging', async () => {
    harness = createTestApp();
    const folder = path.join(harness.ctx.vault.root, 'Many');
    mkdirSync(folder, { recursive: true });
    for (let index = 0; index < 1005; index += 1)
      writeFileSync(path.join(folder, `N${index}.md`), `common word ${index}`);
    await harness.modules.start({ watch: false });
    const first = await search('common');
    expect(first).toMatchObject({ total: 1000, totalCapped: true });
    const last = await search('common', '&limit=100&offset=1000');
    expect(last.results).toHaveLength(5);
    expect((await search('common 1004')).totalCapped).toBe(false);
  });

  it('never fails on hostile or malformed input', async () => {
    await setUp();
    const inputs = [
      'NEAR(a b)',
      'a AND b NOT c',
      '"unbalanced',
      'col:value',
      'title: x',
      '***',
      '^start',
      '(((',
      ')))',
      '"he said ""hi"""',
      '- -- ---',
      'a"b',
      'x'.repeat(900),
      'OR OR OR',
      'tag:',
      'C++ and C#',
      "'; DROP TABLE notes; --",
      'folder:../..',
      'tag:"',
      '\u0000\u0002\u0003',
      'leader NEAR/2 election',
      '{title}: raft',
      'raft*',
      '"*"',
      '-"',
    ];
    for (const input of inputs) await search(input);
    expect((await search('')).results).toEqual([]);
    const tooLong = await harness.request(`/api/search?q=${'a'.repeat(1001)}`);
    expect(ProblemDetailsSchema.parse(await tooLong.json()).status).toBe(400);
  });

  it('keeps up with edits through the index', async () => {
    await setUp();
    expect(await paths('quorum')).toEqual([]);
    writeFileSync(
      path.join(harness.ctx.vault.root, 'Inbox', 'Draft.md'),
      '# Draft\nA quorum is a majority.',
    );
    harness.modules.notes.indexer.apply({ changed: ['Inbox/Draft.md'] }, 'external');
    expect(await paths('quorum')).toEqual(['Inbox/Draft.md']);
    rmSync(path.join(harness.ctx.vault.root, 'Inbox', 'Draft.md'));
    harness.modules.notes.indexer.apply({ removed: ['Inbox/Draft.md'] }, 'external');
    expect(await paths('quorum')).toEqual([]);
  });
});

describe('recent items', () => {
  const RecentSchema = z.object({
    items: z.array(z.object({ note: z.object({ id: z.string(), path: z.string() }) })),
  });

  it('lists opened notes most recent first, once each, skipping deleted notes', async () => {
    await setUp();
    const tree = z
      .object({ notes: z.array(z.object({ id: z.string(), path: z.string() })) })
      .parse(await (await harness.request('/api/notes')).json());
    const idOf = (notePath: string) =>
      tree.notes.find((entry) => entry.path === notePath)?.id ?? '';
    const open = async (notePath: string) => {
      harness.clock.advance(1000);
      const response = await harness.request('/api/recent', {
        method: 'POST',
        body: JSON.stringify({ kind: 'note', id: idOf(notePath) }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.status).toBe(200);
    };
    await open('Modules/COC251/Raft.md');
    await open('Inbox/Draft.md');
    await open('Modules/COC251/Raft.md');
    const listed = RecentSchema.parse(await (await harness.request('/api/recent')).json());
    expect(listed.items.map((item) => item.note.path)).toEqual([
      'Modules/COC251/Raft.md',
      'Inbox/Draft.md',
    ]);

    rmSync(path.join(harness.ctx.vault.root, 'Inbox', 'Draft.md'));
    harness.modules.notes.indexer.apply({ removed: ['Inbox/Draft.md'] }, 'external');
    const after = RecentSchema.parse(await (await harness.request('/api/recent')).json());
    expect(after.items.map((item) => item.note.path)).toEqual(['Modules/COC251/Raft.md']);
  });
});

describe('helpers', () => {
  it('splits marked text into parts', () => {
    expect(toParts('a \u0002b\u0003 c')).toEqual([
      { text: 'a ', match: false },
      { text: 'b', match: true },
      { text: ' c', match: false },
    ]);
  });

  it('finds the first line where a term starts a word, ignoring case and accents', () => {
    const text = '# Title\nnot preleader\nThe LEADER here\nCafé';
    expect(firstMatchingLine(text, ['leader'])).toBe(3);
    expect(firstMatchingLine(text, ['cafe'])).toBe(4);
    expect(firstMatchingLine(text, ['absent'])).toBeNull();
  });
});
