import { existsSync } from 'node:fs';
import { LocatorSchema, SourceSectionSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeDocx, makePdf, makePptx } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

const lecture = () =>
  makePdf([
    ['Lecture 3: Consensus', 'Why replicas must agree.'],
    ['Paxos has two phases: prepare and accept.', 'A majority quorum is required.'],
  ]);

describe('importing sources', () => {
  it('copies the original byte for byte, ingests it and makes it searchable at the page', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const bytes = lecture();
    const imported = await bed.imported('Lecture 3.pdf', bytes);
    expect(imported.duplicate).toBe(false);
    expect(imported.source).toMatchObject({
      kind: 'pdf',
      title: 'Lecture 3',
      path: 'Sources/Inbox/Lecture 3.pdf',
      originalName: 'Lecture 3.pdf',
      status: 'pending',
      moduleCode: null,
    });
    expect(imported.source.job).toMatchObject({ kind: 'source.ingest', status: 'queued' });
    expect(Buffer.compare(bed.read('Sources/Inbox/Lecture 3.pdf'), Buffer.from(bytes))).toBe(0);

    await bed.settle();
    const source = await bed.source(imported.source.id);
    expect(source).toMatchObject({
      status: 'ready',
      pageCount: 2,
      sectionCount: 2,
      job: null,
      error: null,
    });
    expect(source.chunkCount).toBeGreaterThanOrEqual(2);
    expect(source.ingestedAt).not.toBeNull();

    const sections = z
      .object({ sections: z.array(SourceSectionSchema) })
      .parse(await (await bed.request(`/api/sources/${source.id}/sections`)).json()).sections;
    expect(sections.map((section) => section.label)).toEqual(['p. 1', 'p. 2']);

    const hits = await bed.sourceHits('quorum');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      source: {
        id: source.id,
        title: 'Lecture 3',
        kind: 'pdf',
        path: 'Sources/Inbox/Lecture 3.pdf',
      },
      section: { ordinal: 1, label: 'p. 2' },
      locator: { kind: 'pdf', sourceId: source.id, page: 2 },
    });
    expect(hits[0]?.snippet.some((part) => part.match && /quorum/i.test(part.text))).toBe(true);
    expect(LocatorSchema.parse(hits[0]?.locator)).toBeTruthy();

    // The same file again is recognised, not copied.
    const again = await bed.upload('copy of lecture.pdf', bytes);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true, source: { id: source.id } });
    expect(existsSync(bed.abs('Sources/Inbox/copy of lecture.pdf'))).toBe(false);
  });

  it('files sources by module, keeps names unique and imports every supported format', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const slides = await bed.imported(
      'week2.pptx',
      makePptx([
        {
          title: 'Two-phase commit',
          body: ['Prepare', 'Commit'],
          notes: 'The coordinator can block.',
        },
      ]),
      'COC251',
    );
    expect(slides.source).toMatchObject({
      path: 'Sources/COC251/week2.pptx',
      moduleCode: 'COC251',
    });
    const other = await bed.imported(
      'week2.pptx',
      makePptx([{ title: 'Different deck' }]),
      'COC251',
    );
    expect(other.source.path).toBe('Sources/COC251/week2 1.pptx');
    const report = await bed.imported(
      'report.docx',
      makeDocx([{ heading: 1, text: 'Byzantine faults' }, { p: 'Traitors lie.' }]),
    );
    const notes = await bed.imported(
      'reading.md',
      new TextEncoder().encode('# Gossip\nEpidemic protocols spread.'),
    );
    const text = await bed.imported(
      'plain.txt',
      new TextEncoder().encode('Vector clocks order events.'),
    );
    await bed.settle();
    for (const id of [slides, other, report, notes, text].map((result) => result.source.id))
      expect((await bed.source(id)).status).toBe('ready');

    expect((await bed.sourceHits('coordinator'))[0]?.locator).toEqual({
      kind: 'slides',
      sourceId: slides.source.id,
      slide: 1,
      part: 'notes',
    });
    expect((await bed.sourceHits('traitors'))[0]?.locator).toMatchObject({
      kind: 'docx',
      headingPath: ['Byzantine faults'],
    });
    expect((await bed.sourceHits('epidemic'))[0]?.section.label).toBe('Gossip');
    expect((await bed.sourceHits('vector clocks'))[0]?.source.kind).toBe('text');
    expect((await bed.list()).map((source) => source.title).sort()).toEqual([
      'plain',
      'reading',
      'report',
      'week2',
      'week2 1',
    ]);
  });

  it('records failures with a reason and retries on request', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const broken = new TextEncoder().encode('%PDF-1.4\nnot really a PDF at all');
    const imported = await bed.imported('broken.pdf', broken);
    await bed.settle();
    const failed = await bed.source(imported.source.id);
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'The PDF is damaged or is not really a PDF.',
    });

    // Fixing the file is noticed by itself; retrying also works.
    bed.write(failed.path, lecture());
    bed.changed([failed.path]);
    await bed.settle();
    expect((await bed.source(failed.id)).status).toBe('ready');
    const retried = await bed.request(`/api/sources/${failed.id}/retry`, { method: 'POST' });
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ status: 'pending' });
    await bed.settle();
    expect((await bed.source(failed.id)).status).toBe('ready');
  });

  it('ingests idempotently and re-ingests after a parser upgrade', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const { source } = await bed.imported('Lecture 3.pdf', lecture());
    await bed.settle();
    const ready = await bed.source(source.id);
    bed.clock.advance(60_000);
    bed.modules.jobs.enqueue('source.ingest', { sourceId: source.id });
    await bed.settle();
    expect((await bed.source(source.id)).ingestedAt).toBe(ready.ingestedAt);

    bed.modules.sources.repo.update(source.id, { parserVersion: 'pdf-0' });
    await bed.modules.sources.start();
    await bed.settle();
    const upgraded = bed.modules.sources.repo.byId(source.id);
    expect(upgraded?.parserVersion).toBe('pdf-1');
    expect(upgraded?.ingestedAt).not.toBe(ready.ingestedAt);
  });

  it('applies search filters to sources', async () => {
    bed = createSourcesTestbed();
    bed.write('Notes/Consensus.md', '---\ntags: [exam]\n---\n# Consensus\nA quorum note.');
    await bed.start();
    await bed.imported('Lecture 3.pdf', lecture(), 'COC251');
    await bed.imported('deck.pptx', makePptx([{ title: 'Quorum systems' }]));
    await bed.settle();
    const kinds = async (q: string) =>
      (await bed.search(q)).results
        .map((result) => (result.kind === 'note' ? 'note' : result.source.kind))
        .sort();
    expect(await kinds('quorum')).toEqual(['note', 'pdf', 'pptx']);
    expect(await kinds('quorum kind:note')).toEqual(['note']);
    expect(await kinds('quorum kind:sources')).toEqual(['pdf', 'pptx']);
    expect(await kinds('quorum kind:slides')).toEqual(['pptx']);
    expect(await kinds('quorum -kind:pdf')).toEqual(['note', 'pptx']);
    expect(await kinds('quorum tag:exam')).toEqual(['note']);
    expect(await kinds('quorum module:COC251')).toEqual(['pdf']);
    expect(await kinds('quorum folder:Sources/Inbox')).toEqual(['pptx']);
    // Filters alone list sources by their first passage.
    expect(await kinds('kind:pdf')).toEqual(['pdf']);
    expect((await bed.sourceHits('kind:pdf'))[0]?.section.label).toBe('p. 1');
  });
});
