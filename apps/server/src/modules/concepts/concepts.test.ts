import { readFileSync } from 'node:fs';
import {
  ConceptDetailSchema,
  ConceptSummarySchema,
  ModuleSummarySchema,
  NoteDetailSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { makePdf } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { createModules } from '../index';
import { slugify } from './service';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

async function setUp() {
  bed = createSourcesTestbed();
  await bed.start();
  return jsonApi(bed.request);
}

const linkKinds = async (api: ReturnType<typeof jsonApi>, noteId: string) =>
  (await api.get(`/api/notes/${noteId}`, NoteDetailSchema)).links.map((link) => [
    link.target,
    link.resolution.kind,
  ]);

describe('concepts', () => {
  it('keeps names and aliases unique and gives every concept a slug', async () => {
    const api = await setUp();
    const cap = await api.post(
      '/api/concepts',
      { name: 'CAP theorem', aliases: ['Brewer’s theorem'], summary: 'Pick two of three.' },
      201,
      ConceptSummarySchema,
    );
    expect(cap).toMatchObject({
      slug: 'cap-theorem',
      aliases: ['Brewer’s theorem'],
      importance: 1,
    });
    await api.post('/api/concepts', { name: 'brewer’s THEOREM' }, 409);
    await api.post('/api/concepts', { name: 'Consistency', aliases: ['cap theorem'] }, 409);
    await api.post('/api/concepts', { name: 'Raft', aliases: ['raft'] }, 400);
    await api.post('/api/concepts', { name: 'Bad [[name]]' }, 400);
    const first = await api.post(
      '/api/concepts',
      { name: 'Raft (algorithm)' },
      201,
      ConceptSummarySchema,
    );
    const second = await api.post(
      '/api/concepts',
      { name: 'Raft algorithm' },
      201,
      ConceptSummarySchema,
    );
    expect([first.slug, second.slug]).toEqual(['raft-algorithm', 'raft-algorithm-2']);
    expect(slugify('  Café: déjà vu! ')).toBe('cafe-deja-vu');

    const list = await api.get(
      '/api/concepts',
      z.object({ concepts: z.array(ConceptSummarySchema) }),
    );
    expect(list.concepts.map((concept) => concept.name)).toEqual([
      'CAP theorem',
      'Raft (algorithm)',
      'Raft algorithm',
    ]);
  });

  it('resolves links, lists mentions and passages, and follows renames and deletion', async () => {
    const api = await setUp();
    const note = await api.post(
      '/api/notes',
      {
        title: 'Reading',
        content: '# Reading\nThe [[CAP theorem]] matters.\nAlso [[Brewer]] and [[Raft]].',
      },
      201,
      NoteDetailSchema,
    );
    expect(await linkKinds(api, note.id)).toEqual([
      ['CAP theorem', 'unresolved'],
      ['Brewer', 'unresolved'],
      ['Raft', 'unresolved'],
    ]);
    await bed.imported('Lecture.pdf', makePdf([['Intro'], ['The CAP theorem says pick two.']]));
    await bed.settle();

    const module = await api.post(
      '/api/modules',
      { code: 'COC251', title: 'DS' },
      201,
      ModuleSummarySchema,
    );
    const cap = await api.post(
      '/api/concepts',
      { name: 'CAP theorem', aliases: ['Brewer'], moduleIds: [module.id] },
      201,
      ConceptSummarySchema,
    );
    expect(await linkKinds(api, note.id)).toEqual([
      ['CAP theorem', 'concept'],
      ['Brewer', 'concept'],
      ['Raft', 'unresolved'],
    ]);

    const detail = await api.get(`/api/concepts/${cap.id}`, ConceptDetailSchema);
    expect(detail.mentionCount).toBe(1);
    expect(detail.mentions).toEqual([
      {
        note: { id: note.id, path: note.path, title: 'Reading' },
        lines: [
          { line: 2, context: 'The [[CAP theorem]] matters.' },
          { line: 3, context: 'Also [[Brewer]] and [[Raft]].' },
        ],
      },
    ]);
    expect(detail.modules.map((item) => item.code)).toEqual(['COC251']);
    expect(detail.passages[0]).toMatchObject({
      section: { label: 'p. 2' },
      locator: { kind: 'pdf', page: 2 },
    });
    expect(detail.passages[0]?.snippet.some((part) => part.match)).toBe(true);
    expect((await api.get(`/api/modules/${module.id}`)) as { concepts: unknown[] }).toMatchObject({
      concepts: [{ id: cap.id, name: 'CAP theorem' }],
    });

    // Renaming re-resolves links; the backing note keeps its id in the file.
    await api.patch(`/api/concepts/${cap.id}`, { name: 'CAP', aliases: [], noteId: note.id }, 200);
    expect(await linkKinds(api, note.id)).toEqual([
      ['CAP theorem', 'unresolved'],
      ['Brewer', 'unresolved'],
      ['Raft', 'unresolved'],
    ]);
    expect(readFileSync(bed.abs(note.path), 'utf8')).toMatch(/^---\nid: note_/);
    expect((await api.get(`/api/concepts/${cap.id}`, ConceptDetailSchema)).note?.id).toBe(note.id);

    await api.patch(`/api/concepts/${cap.id}`, { aliases: ['CAP theorem'] }, 200);
    expect((await linkKinds(api, note.id))[0]).toEqual(['CAP theorem', 'concept']);
    await api.delete(`/api/concepts/${cap.id}`);
    expect((await linkKinds(api, note.id))[0]).toEqual(['CAP theorem', 'unresolved']);
    await api.get(`/api/concepts/${cap.id}`, undefined, 404);
  });

  it('resolves links to concepts in notes written later, and after a restart', async () => {
    const api = await setUp();
    await api.post('/api/concepts', { name: 'Quorum' }, 201);
    bed.write('Later.md', 'A [[quorum]] is a majority.');
    bed.changed(['Later.md']);
    const tree = (await api.get('/api/notes')) as { notes: { id: string; path: string }[] };
    const later = tree.notes.find((item) => item.path === 'Later.md');
    expect(await linkKinds(api, later?.id ?? '')).toEqual([['quorum', 'concept']]);

    // A restart on an index rebuilt from the files: concepts are known before the first scan.
    await bed.modules.close();
    bed.ctx.db.exec('DELETE FROM notes');
    bed.write('Later.md', 'A [[quorum]] is a majority, still.');
    const restarted = createModules(bed.ctx);
    await restarted.notes.start({ watch: false });
    const row = restarted.notes.repo.byPath('Later.md');
    expect(restarted.notes.repo.linksFrom(row?.docId ?? -1).map((link) => link.targetKind)).toEqual(
      ['concept'],
    );
    await restarted.close();
  });
});
