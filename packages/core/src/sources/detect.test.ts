import { describe, expect, it } from 'vitest';
import { detectSourceKind, extensionOf, SOURCE_ACCEPT } from './detect';
import { locatorLabel } from './types';

const bytes = (text: string) => new TextEncoder().encode(text);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe('detectSourceKind', () => {
  it('accepts files whose contents match their extension', () => {
    expect(detectSourceKind('Lecture 1.PDF', bytes('%PDF-1.7\n'))).toMatchObject({
      ok: true,
      kind: 'pdf',
      mediaType: 'application/pdf',
    });
    // Junk before the header is allowed by PDF readers.
    expect(detectSourceKind('a.pdf', bytes(`${' '.repeat(100)}%PDF-1.4`)).ok).toBe(true);
    expect(detectSourceKind('slides.pptx', zip)).toMatchObject({ ok: true, kind: 'pptx' });
    expect(detectSourceKind('report.docx', zip)).toMatchObject({ ok: true, kind: 'docx' });
    expect(detectSourceKind('notes.md', bytes('# Paxos\n'))).toMatchObject({ kind: 'markdown' });
    expect(detectSourceKind('C:\\x\\readme.txt', bytes('café'))).toMatchObject({ kind: 'text' });
  });

  it('refuses mismatched contents, binaries and unknown formats', () => {
    expect(detectSourceKind('evil.pdf', zip)).toMatchObject({ ok: false });
    expect(detectSourceKind('evil.pptx', bytes('%PDF-1.7'))).toMatchObject({ ok: false });
    expect(detectSourceKind('setup.exe', bytes('MZ\x90\x00'))).toMatchObject({ ok: false });
    expect(detectSourceKind('notes.txt', new Uint8Array([0x4d, 0x5a, 0x00, 0x01]))).toMatchObject({
      ok: false,
    });
    expect(
      detectSourceKind('latin1.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20]), true),
    ).toMatchObject({
      ok: false,
    });
    expect(detectSourceKind('README', bytes('text'))).toMatchObject({ ok: false });
    expect(detectSourceKind('empty.pdf', new Uint8Array())).toMatchObject({
      ok: false,
      reason: 'The file is empty.',
    });
    const legacy = detectSourceKind('old.ppt', bytes('\xd0\xcf'));
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) expect(legacy.reason).toContain('.pptx');
  });

  it('tolerates a multi-byte character cut at the end of the head', () => {
    const encoded = bytes('naïve café');
    expect(detectSourceKind('a.txt', encoded.subarray(0, encoded.length - 1)).ok).toBe(true);
    expect(detectSourceKind('a.txt', encoded.subarray(0, encoded.length - 1), true).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('reads extensions and lists accepted types', () => {
    expect(extensionOf('Week 1/slides.v2.PPTX')).toBe('pptx');
    expect(extensionOf('.hidden')).toBe('');
    expect(SOURCE_ACCEPT).toContain('.pdf');
  });

  it('labels locators', () => {
    expect(locatorLabel({ kind: 'pdf', sourceId: 's', page: 12 })).toBe('p. 12');
    expect(locatorLabel({ kind: 'slides', sourceId: 's', slide: 3, part: 'notes' })).toBe(
      'Slide 3 (notes)',
    );
    expect(
      locatorLabel({
        kind: 'docx',
        sourceId: 's',
        headingPath: ['2 Background', 'Paxos'],
        paragraph: 4,
      }),
    ).toBe('2 Background › Paxos');
    expect(locatorLabel({ kind: 'text', sourceId: 's', headingPath: [], line: 1 })).toBe('Start');
    expect(
      locatorLabel({ kind: 'media', sourceId: 's', startMs: 3_723_000, endMs: 3_730_000 }),
    ).toBe('1:02:03');
  });
});
