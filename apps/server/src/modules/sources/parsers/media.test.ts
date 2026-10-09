import { SourceSectionSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makePdf } from '../../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../../test/sources-helpers';
import { estimateSections, groupSegments } from './media';

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

const encoder = new TextEncoder();
const concat = (...parts: (Uint8Array | string)[]) => {
  const chunks = parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : part));
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

/** An "MP3" with an ID3 header and a transcript the test transcriber reads out. */
const recording = (lines: string[]) =>
  concat(
    new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]),
    `\nMOCK TRANSCRIPT\n${lines.join('\n')}\nEND TRANSCRIPT\n`,
  );

/** A "PNG" with a signature and text the test model reads out. */
const picture = (text: string) =>
  concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    `\nMOCK TEXT\n${text}\nEND TEXT\n`,
  );

const Sections = z.object({ sections: z.array(SourceSectionSchema) });

async function sectionsOf(id: string) {
  return Sections.parse(await (await bed?.request(`/api/sources/${id}/sections`))?.json()).sections;
}

describe('transcript sections', () => {
  it('joins timed segments into sections of about a minute', () => {
    const sections = groupSegments(
      [
        { text: ' Paxos uses ballots. ', startSecond: 0, endSecond: 30 },
        { text: 'Leaders are elected.', startSecond: 30, endSecond: 75 },
        { text: 'Done.', startSecond: 75, endSecond: 90.5 },
      ],
      'src_x',
    );
    expect(sections).toEqual([
      expect.objectContaining({
        label: '0:00',
        text: 'Paxos uses ballots. Leaders are elected.',
        locator: { kind: 'media', sourceId: 'src_x', startMs: 0, endMs: 75_000 },
      }),
      expect.objectContaining({
        label: '1:15',
        text: 'Done.',
        locator: { kind: 'media', sourceId: 'src_x', startMs: 75_000, endMs: 90_500 },
      }),
    ]);
  });

  it('estimates times for a transcript without them', () => {
    const words = Array.from({ length: 300 }, (_, index) => `w${index}`).join(' ');
    const sections = estimateSections(words, 120, 'src_x');
    expect(sections.map((section) => section.locator)).toEqual([
      { kind: 'media', sourceId: 'src_x', startMs: 0, endMs: 60_000 },
      { kind: 'media', sourceId: 'src_x', startMs: 60_000, endMs: 120_000 },
    ]);
    expect(estimateSections('  ', null, 'src_x')).toEqual([]);
  });
});

describe('recordings, images and scans', () => {
  it('transcribes a recording into timed, searchable sections', async () => {
    bed = createSourcesTestbed({ config: { aiMock: true } });
    await bed.start();
    const imported = await bed.imported(
      'Lecture 4.mp3',
      recording([
        '[0-30] Paxos uses numbered ballots.',
        '[30-75] A leader is elected by a majority.',
        '[75-90] That is all for today.',
      ]),
    );
    expect(imported.source).toMatchObject({ kind: 'audio', mediaType: 'audio/mpeg' });
    await bed.settle();
    const source = await bed.source(imported.source.id);
    expect(source).toMatchObject({ status: 'ready', warnings: [] });
    const sections = await sectionsOf(imported.source.id);
    expect(sections.map((section) => [section.label, section.locator])).toEqual([
      ['0:00', { kind: 'media', sourceId: imported.source.id, startMs: 0, endMs: 75_000 }],
      ['1:15', { kind: 'media', sourceId: imported.source.id, startMs: 75_000, endMs: 90_000 }],
    ]);
    const hits = await bed.sourceHits('ballots');
    expect(hits[0]).toMatchObject({ source: { id: imported.source.id, kind: 'audio' } });
  });

  it('imports a recording without AI, saying how to transcribe it later', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const imported = await bed.imported('talk.mp3', recording(['[0-5] Hello.']));
    await bed.settle();
    const source = await bed.source(imported.source.id);
    expect(source.status).toBe('ready');
    expect(source.warnings[0]).toMatchObject({ code: 'needs-ai' });
    expect(source.warnings[0]?.message).toMatch(/Read again/u);
    expect(await sectionsOf(imported.source.id)).toEqual([]);
  });

  it('reads the text of an image', async () => {
    bed = createSourcesTestbed({ config: { aiMock: true } });
    await bed.start();
    const imported = await bed.imported('whiteboard.png', picture('Quorum = floor(n/2) + 1'));
    await bed.settle();
    const sections = await sectionsOf(imported.source.id);
    expect(sections).toEqual([
      expect.objectContaining({
        label: 'Image',
        text: 'Quorum = floor(n/2) + 1',
        locator: { kind: 'image', sourceId: imported.source.id },
      }),
    ]);
    expect((await bed.source(imported.source.id)).warnings[0]).toMatchObject({
      code: 'read-by-ai',
    });
  });

  it('reads the pages of a PDF that have no text layer', async () => {
    bed = createSourcesTestbed({ config: { aiMock: true } });
    await bed.start();
    const imported = await bed.imported('scan.pdf', makePdf([['Typed page one.'], []]));
    await bed.settle();
    const sections = await sectionsOf(imported.source.id);
    expect(sections[0]?.text).toBe('Typed page one.');
    expect(sections[1]?.text).toMatch(/^Test reading of a file/u);
    const source = await bed.source(imported.source.id);
    expect(source.warnings.map((warning) => warning.code)).toEqual(['read-by-ai']);
    expect(source.warnings[0]?.message).toMatch(/^Page 2 had no text layer/u);
  });
});
