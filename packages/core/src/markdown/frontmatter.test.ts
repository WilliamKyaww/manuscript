import { describe, expect, it } from 'vitest';
import {
  FrontmatterEditError,
  parseFrontmatter,
  setFrontmatterValues,
  splitFrontmatter,
  stringList,
} from './frontmatter';

describe('splitFrontmatter', () => {
  it('finds the YAML block and the body', () => {
    const text = '---\ntitle: A\n---\n# Body\n';
    const split = splitFrontmatter(text);
    expect(split).toMatchObject({ present: true, yaml: 'title: A\n', lineCount: 3 });
    expect(text.slice(split.bodyStart)).toBe('# Body\n');
  });

  it('supports "..." as the closing delimiter, empty blocks and a missing body', () => {
    expect(splitFrontmatter('---\na: 1\n...\nbody').yaml).toBe('a: 1\n');
    expect(splitFrontmatter('---\n---\nbody')).toMatchObject({ present: true, yaml: '' });
    expect(splitFrontmatter('---\na: 1\n---')).toMatchObject({ present: true, yaml: 'a: 1\n' });
  });

  it('ignores a thematic break that is not at the very start, or an unclosed block', () => {
    expect(splitFrontmatter('text\n---\na: 1\n---\n').present).toBe(false);
    expect(splitFrontmatter('---\na: 1\nno close').present).toBe(false);
  });
});

describe('parseFrontmatter', () => {
  it('parses mappings and keeps dates as strings', () => {
    expect(parseFrontmatter('created: 2026-10-04\ntags: [a]').data).toEqual({
      created: '2026-10-04',
      tags: ['a'],
    });
  });

  it('reports invalid YAML and non-mappings', () => {
    expect(parseFrontmatter('a: [').error).toMatch(/not valid YAML/);
    expect(parseFrontmatter('- a\n- b').error).toMatch(/key: value/);
    expect(parseFrontmatter('a: 1\na: 2').error).toMatch(/not valid YAML/);
  });
});

describe('setFrontmatterValues', () => {
  it('adds an id as the first key and keeps comments, order and formatting', () => {
    const text =
      '---\n# My comment\ntitle: "Consensus"   # inline\ntags: [exam, consensus]\n---\nBody\n';
    const result = setFrontmatterValues(
      text,
      { id: 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7' },
      { position: 'start' },
    );
    expect(result).toBe(
      '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\n# My comment\ntitle: "Consensus" # inline\ntags: [ exam, consensus ]\n---\nBody\n',
    );
  });

  it('creates frontmatter when there is none', () => {
    expect(setFrontmatterValues('# Title\n', { id: 'note_X' })).toBe(
      '---\nid: note_X\n---\n# Title\n',
    );
  });

  it('updates and removes keys', () => {
    const text = '---\ntitle: Old\ntype: note\n---\n';
    expect(setFrontmatterValues(text, { title: 'New', type: undefined })).toBe(
      '---\ntitle: New\n---\n',
    );
  });

  it('keeps CRLF line endings and the byte-order mark', () => {
    const text = '﻿---\r\ntitle: A\r\n---\r\nBody\r\n';
    expect(setFrontmatterValues(text, { type: 'note' })).toBe(
      '﻿---\r\ntitle: A\r\ntype: note\r\n---\r\nBody\r\n',
    );
    expect(setFrontmatterValues('Body\r\n', { id: 'x' })).toBe('---\r\nid: x\r\n---\r\nBody\r\n');
  });

  it('refuses to edit invalid YAML', () => {
    expect(() => setFrontmatterValues('---\na: [\n---\n', { id: 'x' })).toThrow(
      FrontmatterEditError,
    );
  });

  it('leaves text untouched when there is nothing to add', () => {
    expect(setFrontmatterValues('Body', { gone: undefined })).toBe('Body');
  });
});

describe('stringList', () => {
  it('accepts lists, comma-separated strings and numbers', () => {
    expect(stringList(['a', 2, null])).toEqual(['a', '2']);
    expect(stringList('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(stringList(7)).toEqual(['7']);
    expect(stringList(undefined)).toEqual([]);
    expect(stringList({ a: 1 })).toEqual([]);
  });
});
