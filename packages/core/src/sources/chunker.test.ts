import { describe, expect, it } from 'vitest';
import { chunkDocument, chunkSpans, contextPrefixOf, estimateTokens } from './chunker';
import { LocatorSchema, type NormalisedDocument, type NormalisedSection } from './types';

const doc = (sections: NormalisedSection[]): NormalisedDocument => ({
  title: null,
  pageCount: null,
  sections,
  warnings: [],
  metadata: {},
});

const sentence = (index: number) => `Sentence number ${index} explains one idea about consensus.`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, offset) => sentence(from + offset)).join(' ');

describe('chunkSpans', () => {
  it('keeps short text as one chunk without surrounding whitespace', () => {
    const text = '\n  Paxos is safe.  \n';
    const spans = chunkSpans(text);
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe('Paxos is safe.');
    expect(chunkSpans('   \n\n ')).toEqual([]);
  });

  it('cuts at paragraph boundaries first and never exceeds the limit', () => {
    const text = [paragraph(0, 4), paragraph(4, 4), paragraph(8, 4)].join('\n\n');
    const spans = chunkSpans(text, { maxTokens: 70, overlapTokens: 0 });
    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(span.end - span.start).toBeLessThanOrEqual(280);
      const chunk = text.slice(span.start, span.end);
      expect(chunk.startsWith('Sentence number')).toBe(true);
      expect(chunk.endsWith('consensus.')).toBe(true);
    }
  });

  it('falls back to sentences, then words, then hard cuts', () => {
    const long = paragraph(0, 40);
    const spans = chunkSpans(long, { maxTokens: 30, overlapTokens: 0 });
    for (const span of spans) expect(span.end - span.start).toBeLessThanOrEqual(120);
    // Nothing is lost: every sentence appears in some chunk.
    const joined = spans.map((span) => long.slice(span.start, span.end)).join(' ');
    for (let index = 0; index < 40; index += 1) expect(joined).toContain(sentence(index));

    const unbroken = 'x'.repeat(1000);
    const cut = chunkSpans(unbroken, { maxTokens: 50, overlapTokens: 0 });
    expect(cut.map((span) => span.end - span.start)).toEqual([200, 200, 200, 200, 200]);
  });

  it('repeats trailing units of a chunk at the start of the next one', () => {
    const text = Array.from({ length: 12 }, (_, index) => sentence(index)).join('\n');
    const spans = chunkSpans(text, { maxTokens: 60, overlapTokens: 16 });
    expect(spans.length).toBeGreaterThan(2);
    for (let index = 1; index < spans.length; index += 1) {
      const previous = spans[index - 1];
      const current = spans[index];
      if (!previous || !current) throw new Error('missing span');
      expect(current.start).toBeLessThan(previous.end);
      expect(current.start).toBeGreaterThan(previous.start);
    }
    expect(spans.at(-1)?.end).toBe(text.length);
  });
});

describe('chunkDocument', () => {
  it('gives every chunk a valid locator that points into its section', () => {
    const pageText = [paragraph(0, 6), paragraph(6, 6)].join('\n');
    const chunks = chunkDocument(
      doc([
        {
          kind: 'page',
          label: 'p. 1',
          text: pageText,
          notes: null,
          headingPath: [],
          locator: { kind: 'pdf', sourceId: 'src_1', page: 1 },
        },
        {
          kind: 'page',
          label: 'p. 2',
          text: '',
          notes: null,
          headingPath: [],
          locator: { kind: 'pdf', sourceId: 'src_1', page: 2 },
        },
      ]),
      'Lecture 3',
      { maxTokens: 80, overlapTokens: 0 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(chunks.map((_, index) => index));
    for (const chunk of chunks) {
      expect(LocatorSchema.safeParse(chunk.locator).success).toBe(true);
      if (chunk.locator.kind !== 'pdf') throw new Error('expected a PDF locator');
      expect(chunk.locator.page).toBe(1);
      expect(pageText.slice(chunk.locator.charStart, chunk.locator.charEnd)).toBe(chunk.text);
      expect(chunk.contextPrefix).toBe('Lecture 3 › p. 1');
      expect(chunk.tokenEstimate).toBe(estimateTokens(chunk.text));
    }
  });

  it('chunks speaker notes separately with a notes locator', () => {
    const chunks = chunkDocument(
      doc([
        {
          kind: 'slide',
          label: 'Slide 4',
          text: 'Two-phase commit\nPrepare, then commit',
          notes: 'Mention that the coordinator is a single point of failure.',
          headingPath: ['Two-phase commit'],
          locator: { kind: 'slides', sourceId: 'src_1', slide: 4, part: 'body' },
        },
      ]),
      'Week 2',
    );
    expect(chunks.map((chunk) => chunk.locator)).toEqual([
      { kind: 'slides', sourceId: 'src_1', slide: 4, part: 'body' },
      { kind: 'slides', sourceId: 'src_1', slide: 4, part: 'notes' },
    ]);
    expect(chunks[1]?.text).toContain('single point of failure');
    expect(chunks[0]?.contextPrefix).toBe('Week 2 › Slide 4 › Two-phase commit');
  });

  it('advances line and paragraph locators to where each chunk starts', () => {
    const lines = Array.from({ length: 30 }, (_, index) => sentence(index)).join('\n');
    const textChunks = chunkDocument(
      doc([
        {
          kind: 'heading',
          label: 'Background',
          text: lines,
          notes: null,
          headingPath: ['Paper', 'Background'],
          locator: {
            kind: 'text',
            sourceId: 'src_1',
            headingPath: ['Paper', 'Background'],
            line: 10,
          },
        },
      ]),
      'Notes',
      { maxTokens: 60, overlapTokens: 0 },
    );
    for (const chunk of textChunks) {
      if (chunk.locator.kind !== 'text') throw new Error('expected a text locator');
      const firstLine = chunk.text.split('\n')[0];
      expect(lines.split('\n')[chunk.locator.line - 10]).toBe(firstLine);
    }
    expect(textChunks[0]?.contextPrefix).toBe('Notes › Paper › Background');

    const paragraphs = Array.from({ length: 12 }, (_, index) => paragraph(index * 3, 3));
    const docxChunks = chunkDocument(
      doc([
        {
          kind: 'heading',
          label: 'Method',
          text: paragraphs.join('\n\n'),
          notes: null,
          headingPath: ['Method'],
          locator: { kind: 'docx', sourceId: 'src_1', headingPath: ['Method'], paragraph: 5 },
        },
      ]),
      'Report',
      { maxTokens: 90, overlapTokens: 0 },
    );
    for (const chunk of docxChunks) {
      if (chunk.locator.kind !== 'docx') throw new Error('expected a DOCX locator');
      expect(chunk.text.startsWith(paragraphs[chunk.locator.paragraph - 5] ?? '?')).toBe(true);
    }
  });
});

describe('contextPrefixOf', () => {
  it('skips empty parts', () => {
    expect(
      contextPrefixOf('', {
        kind: 'heading',
        label: 'Start',
        text: '',
        notes: null,
        headingPath: [],
        locator: { kind: 'text', sourceId: 'src_1', headingPath: [], line: 1 },
      }),
    ).toBe('');
  });
});
