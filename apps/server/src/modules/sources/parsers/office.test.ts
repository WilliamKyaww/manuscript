import { chunkDocument, type ParseInput } from '@skb/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { makeDocx, makePptx, makeZipBomb } from '../../../../test/fixtures/sources/builders';
import { docxParser, escapeBlockStart } from './docx';
import { SourceParseError } from './errors';
import { pptxParser } from './pptx';
import { decodeEntities, parseXml } from './xml';
import { readZipEntries, resolvePartPath } from './zip';

const input = (bytes: Uint8Array, fileName: string): ParseInput => ({
  bytes,
  fileName,
  sourceId: 'src_1',
  signal: new AbortController().signal,
});

describe('PPTX parser', () => {
  it('reads slides in presentation order with titles, body, tables and speaker notes', async () => {
    const bytes = makePptx(
      [
        {
          title: 'Consensus',
          body: ['Why agree?', '>Replicas & failures'],
          notes: 'Start with the bank example.',
        },
        {
          title: 'Paxos',
          body: ['Prepare', 'Accept'],
          table: [
            ['Phase', 'Message'],
            ['1', 'Promise'],
          ],
        },
        { body: ['A slide without a title'], hidden: true },
      ],
      { title: 'Week 3', reverseFiles: true },
    );
    const document = await pptxParser.parse(input(bytes, 'week3.pptx'));
    expect(document.title).toBe('Week 3');
    expect(document.pageCount).toBe(3);
    expect(document.metadata).toEqual({ slides: 3, hiddenSlides: 1 });
    expect(document.sections.map((section) => [section.label, section.headingPath])).toEqual([
      ['Slide 1', ['Consensus']],
      ['Slide 2', ['Paxos']],
      ['Slide 3', []],
    ]);
    expect(document.sections[0]?.text).toBe('Consensus\nWhy agree?\n  Replicas & failures');
    expect(document.sections[0]?.notes).toBe('Start with the bank example.');
    expect(document.sections[1]?.text).toBe('Paxos\nPrepare\nAccept\nPhase | Message\n1 | Promise');
    expect(document.sections[1]?.notes).toBeNull();
    // Slide numbers are placeholders repeated on every slide, not content.
    expect(document.sections[2]?.text).toBe('A slide without a title');
    expect(document.sections[2]?.locator).toEqual({
      kind: 'slides',
      sourceId: 'src_1',
      slide: 3,
      part: 'body',
    });

    const chunks = chunkDocument(document, 'Week 3');
    expect(chunks.map((chunk) => chunk.locator)).toContainEqual({
      kind: 'slides',
      sourceId: 'src_1',
      slide: 1,
      part: 'notes',
    });
  });

  it('refuses files that are not presentations, zip bombs and DOCTYPEs', async () => {
    await expect(pptxParser.parse(input(makeDocx([{ p: 'x' }]), 'fake.pptx'))).rejects.toThrow(
      'not a PowerPoint presentation',
    );
    await expect(
      pptxParser.parse(input(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'x.pptx')),
    ).rejects.toThrow('damaged');
    const bomb = makeZipBomb('ppt/presentation.xml', 40 * 1024 * 1024);
    expect(bomb.length).toBeLessThan(100 * 1024);
    await expect(pptxParser.parse(input(bomb, 'bomb.pptx'))).rejects.toThrow('unsafe size');
    const doctype = zipSync({
      'ppt/presentation.xml': strToU8(
        '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><p:presentation>&lol;</p:presentation>',
      ),
    });
    await expect(pptxParser.parse(input(doctype, 'doctype.pptx'))).rejects.toThrow(
      'document type declaration',
    );
  });
});

describe('DOCX parser', () => {
  it('turns headings, paragraphs, lists and tables into sections with paragraph locators', async () => {
    const bytes = makeDocx(
      [
        { p: 'Preface text.' },
        { title: 'Consensus report' },
        { heading: 2, text: 'Background' },
        { p: '# not a heading, just text' },
        { list: 'Safety', level: 0 },
        { list: 'Liveness', level: 1 },
        { heading: 3, text: 'Paxos' },
        {
          table: [
            ['Phase', 'Message'],
            ['1', 'Promise | ack'],
          ],
        },
        { tracked: ['Kept ', 'removed ', 'and inserted.'] },
        { heading: 2, text: 'Raft' },
        { p: 'Leader election.' },
      ],
      { title: 'Report', translatedStyles: true },
    );
    const document = await docxParser.parse(input(bytes, 'report.docx'));
    expect(document.title).toBe('Report');
    expect(
      document.sections.map((section) => [section.label, section.headingPath, section.locator]),
    ).toEqual([
      ['Start', [], { kind: 'docx', sourceId: 'src_1', headingPath: [], paragraph: 0 }],
      [
        'Consensus report',
        ['Consensus report'],
        { kind: 'docx', sourceId: 'src_1', headingPath: ['Consensus report'], paragraph: 1 },
      ],
      [
        'Background',
        ['Consensus report', 'Background'],
        {
          kind: 'docx',
          sourceId: 'src_1',
          headingPath: ['Consensus report', 'Background'],
          paragraph: 2,
        },
      ],
      [
        'Paxos',
        ['Consensus report', 'Background', 'Paxos'],
        {
          kind: 'docx',
          sourceId: 'src_1',
          headingPath: ['Consensus report', 'Background', 'Paxos'],
          paragraph: 6,
        },
      ],
      [
        'Raft',
        ['Consensus report', 'Raft'],
        {
          kind: 'docx',
          sourceId: 'src_1',
          headingPath: ['Consensus report', 'Raft'],
          paragraph: 9,
        },
      ],
    ]);
    expect(document.sections[2]?.text).toBe(
      '## Background\n\n\\# not a heading, just text\n\n- Safety\n\n  - Liveness',
    );
    expect(document.sections[3]?.text).toBe(
      '### Paxos\n\n| Phase | Message |\n| --- | --- |\n| 1 | Promise \\| ack |\n\nKept and inserted.',
    );
    expect(document.metadata).toEqual({ paragraphs: 11 });
  });

  it('refuses files that are not Word documents', async () => {
    await expect(
      docxParser.parse(input(makePptx([{ title: 'x' }]), 'fake.docx')),
    ).rejects.toBeInstanceOf(SourceParseError);
  });
});

describe('XML and ZIP helpers', () => {
  it('decodes entities once', () => {
    expect(decodeEntities('It&#8217;s &amp;#38; &lt;b&gt; &#x2014; &unknown;')).toBe(
      'It’s &#38; <b> — &unknown;',
    );
    const root = parseXml('<a x="&quot;q&quot;">A &amp; B</a>', 'test');
    expect(root.children[0]).toEqual({ name: 'a', attributes: { x: '"q"' }, children: ['A & B'] });
  });

  it('resolves relationship targets and limits entries', () => {
    expect(resolvePartPath('ppt', 'slides/slide1.xml')).toBe('ppt/slides/slide1.xml');
    expect(resolvePartPath('ppt/slides', '../notesSlides/n1.xml')).toBe('ppt/notesSlides/n1.xml');
    expect(resolvePartPath('ppt/slides', '/ppt/media/a.png')).toBe('ppt/media/a.png');
    const many = zipSync(
      Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${index}.xml`, strToU8('x')])),
    );
    expect(() =>
      readZipEntries(many, () => true, 'archive', {
        maxEntries: 10,
        maxEntryBytes: 100,
        maxTotalBytes: 1000,
        maxRatio: 10,
      }),
    ).toThrow('too many parts');
  });

  it('escapes Markdown syntax at the start of document paragraphs', () => {
    expect(escapeBlockStart('1. Not a list')).toBe('\\1. Not a list');
    expect(escapeBlockStart('> quote')).toBe('\\> quote');
    expect(escapeBlockStart('Plain')).toBe('Plain');
  });
});
