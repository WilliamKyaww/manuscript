import { describe, expect, it } from 'vitest';
import { applyTextEdits, encodeLinkDestination, formatWikilink, relativeVaultPath } from './links';
import { analyseNote } from './scan';

describe('applyTextEdits', () => {
  it('applies edits in any order and rejects overlaps', () => {
    expect(
      applyTextEdits('abcdef', [
        { offset: 4, length: 2, text: 'XY' },
        { offset: 0, length: 1, text: '' },
      ]),
    ).toBe('bcdXY');
    expect(() =>
      applyTextEdits('abc', [
        { offset: 0, length: 2, text: '' },
        { offset: 1, length: 1, text: '' },
      ]),
    ).toThrow();
    expect(() => applyTextEdits('abc', [{ offset: 2, length: 5, text: '' }])).toThrow();
  });
});

describe('formatWikilink', () => {
  it('formats targets, fragments, aliases and embeds', () => {
    expect(formatWikilink({ target: 'Raft' })).toBe('[[Raft]]');
    expect(formatWikilink({ target: 'Raft', heading: 'Safety', alias: 'safe' })).toBe(
      '[[Raft#Safety|safe]]',
    );
    expect(formatWikilink({ target: 'FLP', blockRef: 'proof', embed: true })).toBe(
      '![[FLP#^proof]]',
    );
    expect(formatWikilink({ target: 'CAP', alias: 'cap' }, { escapePipe: true })).toBe(
      '[[CAP\\|cap]]',
    );
  });
});

describe('Markdown link paths', () => {
  it('encodes destinations', () => {
    expect(encodeLinkDestination('Week 1/Notes (draft)#1.md')).toBe(
      'Week%201/Notes%20%28draft%29%231.md',
    );
  });

  it('computes relative paths between vault files', () => {
    expect(relativeVaultPath('A/B/Note.md', 'A/C/Other.md')).toBe('../C/Other.md');
    expect(relativeVaultPath('Note.md', 'A/Other.md')).toBe('A/Other.md');
    expect(relativeVaultPath('A/Note.md', 'Other.md')).toBe('../Other.md');
    expect(relativeVaultPath('A/Note.md', 'A/Other.md')).toBe('Other.md');
  });
});

describe('link target spans', () => {
  it('points at just the target of wikilinks and Markdown links', () => {
    const text =
      'x [[ Raft#Safety|alias]] ![[img.png]] [t](<My Notes/a b.md#h> "title") [u](Week%201.md)';
    const spans = analyseNote(text).links.map((link) =>
      text.slice(link.targetOffset, link.targetOffset + link.targetLength),
    );
    expect(spans).toEqual(['Raft', 'img.png', 'My Notes/a b.md', 'Week%201.md']);
  });

  it('has an empty span for same-note heading links', () => {
    const [link] = analyseNote('[[#Summary]]').links;
    expect(link).toMatchObject({ targetOffset: 2, targetLength: 0 });
  });
});
