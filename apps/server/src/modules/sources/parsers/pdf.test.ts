import type { ParseInput } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { makePdf } from '../../../../test/fixtures/sources/builders';
import { SourceParseError } from './errors';
import { pageText, pdfParser } from './pdf';

const input = (bytes: Uint8Array, signal = new AbortController().signal): ParseInput => ({
  bytes,
  fileName: 'lecture.pdf',
  sourceId: 'src_1',
  signal,
});

describe('PDF parser', () => {
  it('extracts one section per page with page locators, title and progress', async () => {
    const bytes = makePdf(
      [
        ['Lecture 3: Consensus', 'Paxos guarantees safety.'],
        ['Raft elects a leader (term numbers).', 'Logs are replicated.'],
      ],
      { title: 'Distributed Systems L3' },
    );
    const progress: number[] = [];
    const document = await pdfParser.parse({
      ...input(bytes),
      onProgress: (value) => progress.push(value),
    });
    expect(document.pageCount).toBe(2);
    expect(document.title).toBe('Distributed Systems L3');
    expect(document.metadata.title).toBe('Distributed Systems L3');
    expect(document.sections.map((section) => section.label)).toEqual(['p. 1', 'p. 2']);
    expect(document.sections[0]?.text).toBe('Lecture 3: Consensus\nPaxos guarantees safety.');
    expect(document.sections[1]?.text).toContain('Raft elects a leader (term numbers).');
    expect(document.sections[1]?.locator).toEqual({ kind: 'pdf', sourceId: 'src_1', page: 2 });
    expect(document.warnings).toEqual([]);
    expect(progress).toEqual([0.5, 1]);
  });

  it('accepts a Node Buffer, as read from disk', async () => {
    const document = await pdfParser.parse(input(Buffer.from(makePdf([['From a Buffer']]))));
    expect(document.sections[0]?.text).toBe('From a Buffer');
  });

  it('reports pages without a text layer', async () => {
    const some = await pdfParser.parse(
      input(makePdf([['Some real text here.'], [], ['More text on page three.']])),
    );
    expect(some.warnings).toEqual([
      expect.objectContaining({
        code: 'pages-without-text',
        message: expect.stringContaining('page 2'),
      }),
    ]);
    const none = await pdfParser.parse(input(makePdf([[], []])));
    expect(none.warnings.map((warning) => warning.code)).toEqual(['no-text']);
    expect(none.sections).toHaveLength(2);
  });

  it('rejects damaged files with a readable reason', async () => {
    const damaged = new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf');
    await expect(pdfParser.parse(input(damaged))).rejects.toBeInstanceOf(SourceParseError);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Cancelled'));
    await expect(pdfParser.parse(input(makePdf([['Text']]), controller.signal))).rejects.toThrow(
      'Cancelled',
    );
  });
});

describe('pageText', () => {
  it('joins items into lines and tidies whitespace', () => {
    expect(
      pageText([
        { str: 'Hello', hasEOL: false },
        { str: '   ', hasEOL: false },
        { str: 'world  ', hasEOL: true },
        { str: '\u0001Next line', hasEOL: true },
        {},
        { str: '', hasEOL: true },
        { str: '', hasEOL: true },
        { str: 'After a gap', hasEOL: false },
      ]),
    ).toBe('Hello world\nNext line\n\nAfter a gap');
  });

  it('rejoins words hyphenated across lines', () => {
    const items = ['The con-', 'sensus algorithm is under-', 'standable. Raft-', 'Paxos'].map(
      (str) => ({
        str,
        hasEOL: true,
      }),
    );
    expect(pageText(items)).toBe('The consensus\nalgorithm is understandable.\nRaft-\nPaxos');
  });
});
