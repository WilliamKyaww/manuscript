import type { ParseInput, SourceParser } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { makeDocx, makePdf, makePptx } from '../../../../test/fixtures/sources/builders';
import { docxParser } from './docx';
import { SourceParseError } from './errors';
import { pdfParser } from './pdf';
import { pptxParser } from './pptx';
import { textParser } from './text';
import { readZipEntries } from './zip';

/**
 * Fuzzing the document parsers (Phase 21, task 21.03): good files damaged at random — bytes flipped,
 * cut short, garbage appended, or replaced by noise — must each either parse or be refused with a
 * SourceParseError, whose message the student sees. Never another kind of error, a hang or a crash.
 * Seeded, so a failure can be replayed; SKB_FUZZ_RUNS sets how many files per format.
 */

const RUNS = Number(process.env.SKB_FUZZ_RUNS ?? 25);

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** One way of damaging a file, chosen at random. */
function damage(good: Uint8Array, next: () => number): { bytes: Uint8Array; how: string } {
  const bytes = new Uint8Array(good);
  const pick = Math.floor(next() * 4);
  if (pick === 0) {
    const flips = 1 + Math.floor(next() * 24);
    for (let index = 0; index < flips; index += 1)
      bytes[Math.floor(next() * bytes.length)] = Math.floor(next() * 256);
    return { bytes, how: `${flips} bytes changed` };
  }
  if (pick === 1) {
    const length = Math.floor(next() * bytes.length);
    return { bytes: bytes.slice(0, length), how: `cut to ${length} bytes` };
  }
  if (pick === 2) {
    const tail = Uint8Array.from({ length: 64 + Math.floor(next() * 512) }, () =>
      Math.floor(next() * 256),
    );
    const joined = new Uint8Array(bytes.length + tail.length);
    joined.set(bytes);
    joined.set(tail, bytes.length);
    return { bytes: joined, how: `${tail.length} bytes appended` };
  }
  const noise = Uint8Array.from({ length: Math.floor(next() * 2048) }, () =>
    Math.floor(next() * 256),
  );
  return { bytes: noise, how: `${noise.length} bytes of noise` };
}

const input = (bytes: Uint8Array, fileName: string): ParseInput => ({
  bytes,
  fileName,
  sourceId: 'src_fuzz',
  signal: new AbortController().signal,
});

async function survives(parser: SourceParser, fileName: string, good: Uint8Array, seed: number) {
  const next = random(seed);
  for (let run = 0; run < RUNS; run += 1) {
    const { bytes, how } = damage(good, next);
    try {
      const document = await parser.parse(input(bytes, fileName));
      expect(Array.isArray(document.sections), `${fileName}, ${how}`).toBe(true);
    } catch (error) {
      if (!(error instanceof SourceParseError))
        throw new Error(`${fileName}, run ${run} (${how}): ${String(error)}`);
      expect(error.message.length).toBeGreaterThan(0);
    }
  }
}

describe('document parsers under fuzzing', () => {
  it('a damaged slide deck is read or refused in words', async () => {
    const good = makePptx([
      { title: 'Consensus', body: ['Why agree?', '>Replicas'], notes: 'Start here.' },
      { title: 'Paxos', body: ['Prepare', 'Accept'] },
    ]);
    await survives(pptxParser, 'deck.pptx', good, 1);
  });

  it('a damaged Word document is read or refused in words', async () => {
    const good = makeDocx([
      { heading: 1, text: 'Raft' },
      { p: 'A leader replicates the log.' },
      { heading: 2, text: 'Terms' },
      { p: 'Each election starts a term.' },
    ]);
    await survives(docxParser, 'notes.docx', good, 2);
  });

  it('a damaged PDF is read or refused in words', async () => {
    const good = makePdf([
      ['Consensus', 'Two generals'],
      ['Paxos', 'Prepare and accept'],
    ]);
    await survives(pdfParser, 'slides.pdf', good, 3);
  }, 120_000);

  it('damaged text and Markdown are always read', async () => {
    const good = new TextEncoder().encode('# Raft\n\nA *leader* per [[term]].\n\n```\ncode\n```\n');
    await survives(textParser, 'notes.md', good, 4);
  });

  it('a damaged zip is read or refused in words', () => {
    const good = makePptx([{ title: 'One', body: ['Two'] }]);
    const next = random(5);
    for (let run = 0; run < RUNS * 2; run += 1) {
      const { bytes, how } = damage(good, next);
      try {
        readZipEntries(bytes, () => true, 'deck.pptx');
      } catch (error) {
        if (!(error instanceof SourceParseError)) throw new Error(`zip (${how}): ${String(error)}`);
      }
    }
  });
});
