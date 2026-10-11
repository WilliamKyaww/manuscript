import { describe, expect, it } from 'vitest';
import { clozeNumbers, renderCloze, revealCloze } from '../learning/cards';
import { parseSearchQuery } from '../search/query';
import { parseFrontmatter, splitFrontmatter } from './frontmatter';
import { analyseNote, maskNonProse, toSearchText } from './scan';

/**
 * Fuzzing the text parsers (Phase 21, task 21.03): random notes built from the pieces of Markdown that
 * matter to us — fences, maths, links, embeds, callouts, comments, front matter, tags — and long runs
 * of a single character, the classic way to make a regular expression take forever. Every parser must
 * return, quickly, with output that makes sense. Seeded, so a failure can be replayed; set
 * SKB_FUZZ_RUNS to run more.
 */

const RUNS = Number(process.env.SKB_FUZZ_RUNS ?? 300);

/** mulberry32: a small seeded generator, so that every run sees the same inputs. */
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

const PIECES = [
  '---\n',
  '...\n',
  'title: x\n',
  'tags: [a, b\n',
  'aliases:\n  - y\n',
  '# ',
  '## ',
  '###### ',
  '\n',
  '\r\n',
  ' ',
  '\t',
  'word ',
  'Raft ',
  'élection ',
  '中文 ',
  '🙂',
  '**',
  '*',
  '_',
  '~~',
  '==',
  '`',
  '```',
  '```ts\n',
  '~~~',
  '$',
  '$$',
  '\\(',
  '\\)',
  '\\',
  '[[',
  ']]',
  '[[Note|alias]]',
  '[[Note#Heading]]',
  '[[#^block]]',
  '![[img.png]]',
  '[',
  ']',
  '(',
  ')',
  '[text](http://example.org)',
  '<http://x>',
  '<!--',
  '-->',
  '%%',
  '> [!note] ',
  '> ',
  '- [ ] ',
  '- [x] ',
  '1. ',
  '#tag ',
  '#a/b ',
  '#',
  '^block',
  '|',
  ':',
  '{{c1::',
  '}}',
  '::',
  '{{c2::x::hint}}',
  '\u0000',
  ' ',
  '﻿',
  '<div>',
  '</div>',
  '&amp;',
  '"',
  "'",
  '-',
  '=',
  '+',
];

function note(next: () => number): string {
  const parts: string[] = [];
  const length = Math.floor(next() * 80);
  for (let index = 0; index < length; index += 1) {
    parts.push(PIECES[Math.floor(next() * PIECES.length)] as string);
  }
  return parts.join('');
}

/** Long runs of one character, and nestings, which make careless patterns backtrack for ever. */
const PATHOLOGICAL = [
  '['.repeat(20_000),
  '[['.repeat(10_000),
  '*'.repeat(20_000),
  '_'.repeat(20_000),
  '`'.repeat(20_000),
  '$'.repeat(20_000),
  '\\'.repeat(20_000),
  '#'.repeat(20_000),
  '{{c1::'.repeat(5_000),
  '<!--'.repeat(5_000),
  '%%'.repeat(10_000),
  '> '.repeat(10_000),
  `---\n${'a: b\n'.repeat(5_000)}`,
  `${'a'.repeat(50_000)}`,
  `${'[a]('.repeat(5_000)}`,
  `${'- '.repeat(10_000)}`,
];

function checkNote(text: string) {
  const analysis = analyseNote(text);
  const lines = text.split(/\r?\n/u).length;
  for (const heading of analysis.headings) {
    expect(heading.level).toBeGreaterThanOrEqual(1);
    expect(heading.level).toBeLessThanOrEqual(6);
    expect(heading.line).toBeGreaterThanOrEqual(1);
    expect(heading.line).toBeLessThanOrEqual(lines);
  }
  expect(analysis.wordCount).toBeGreaterThanOrEqual(0);
  expect(analysis.bodyStart).toBeGreaterThanOrEqual(0);
  expect(analysis.bodyStart).toBeLessThanOrEqual(text.length);
  expect(new Set(analysis.tags).size).toBe(analysis.tags.length);
  expect(typeof toSearchText(text)).toBe('string');
  expect(maskNonProse(text)).toHaveLength(text.length);
  const split = splitFrontmatter(text);
  expect(split.yamlEnd).toBeLessThanOrEqual(text.length);
  expect(typeof parseFrontmatter(split.yaml).data).toBe('object');
  expect(Array.isArray(parseSearchQuery(text.slice(0, 300)).groups)).toBe(true);
  expect(clozeNumbers(text).every((number) => number > 0)).toBe(true);
  expect(typeof revealCloze(text)).toBe('string');
  expect(typeof renderCloze(text, 1, 'front')).toBe('string');
}

describe('text parsers under fuzzing', () => {
  it(`take any of ${RUNS} random notes and return what makes sense`, () => {
    const next = random(21_03);
    for (let run = 0; run < RUNS; run += 1) {
      const text = note(next);
      try {
        checkNote(text);
      } catch (error) {
        throw new Error(`run ${run} failed on ${JSON.stringify(text)}: ${String(error)}`);
      }
    }
  });

  it('finish quickly on long runs of one character', () => {
    for (const text of PATHOLOGICAL) {
      const started = performance.now();
      checkNote(text);
      const took = performance.now() - started;
      // Generous for a loaded laptop; a backtracking pattern takes seconds or minutes, not this.
      expect(
        took,
        `${JSON.stringify(text.slice(0, 12))}… took ${Math.round(took)} ms`,
      ).toBeLessThan(1_500);
    }
  });
});
