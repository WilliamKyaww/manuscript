import { chunkDocument, type ParseInput } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { textParser } from './text';

const input = (fileName: string, content: string | Uint8Array): ParseInput => ({
  bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content,
  fileName,
  sourceId: 'src_1',
  signal: new AbortController().signal,
});

describe('text parser', () => {
  it('splits Markdown at headings, ignoring headings inside code blocks', async () => {
    const markdown = [
      '---',
      'title: Consensus reading',
      '---',
      'Intro paragraph.',
      '',
      '# Paxos',
      'Paxos is safe.',
      '```',
      '# not a heading',
      '```',
      '## Phase 1',
      'Prepare and promise.',
      '# Raft',
      'Leader election.',
    ].join('\r\n');
    const document = await textParser.parse(input('reading.md', markdown));
    expect(document.title).toBe('Consensus reading');
    expect(
      document.sections.map((section) => [section.label, section.headingPath, section.locator]),
    ).toEqual([
      ['Start', [], { kind: 'text', sourceId: 'src_1', headingPath: [], line: 4 }],
      ['Paxos', ['Paxos'], { kind: 'text', sourceId: 'src_1', headingPath: ['Paxos'], line: 6 }],
      [
        'Phase 1',
        ['Paxos', 'Phase 1'],
        { kind: 'text', sourceId: 'src_1', headingPath: ['Paxos', 'Phase 1'], line: 11 },
      ],
      ['Raft', ['Raft'], { kind: 'text', sourceId: 'src_1', headingPath: ['Raft'], line: 13 }],
    ]);
    expect(document.sections[1]?.text).toBe('# Paxos\nPaxos is safe.\n```\n# not a heading\n```');
    expect(document.warnings).toEqual([]);
  });

  it('keeps plain text as one section whose chunks know their lines', async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) => `Line ${index + 1} about quorum systems.`,
    );
    const document = await textParser.parse(input('notes.txt', lines.join('\n')));
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]).toMatchObject({ kind: 'segment', label: 'Text' });
    const chunks = chunkDocument(document, 'notes');
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      if (chunk.locator.kind !== 'text') throw new Error('expected a text locator');
      expect(chunk.text.startsWith(`Line ${chunk.locator.line} `)).toBe(true);
    }
  });

  it('reports invalid UTF-8 and empty files', async () => {
    const invalid = await textParser.parse(
      input('old.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9])),
    );
    expect(invalid.warnings.map((warning) => warning.code)).toEqual(['not-utf8']);
    expect(invalid.sections[0]?.text).toBe('caf�');
    const empty = await textParser.parse(input('empty.md', '   \n'));
    expect(empty.sections).toEqual([]);
    expect(empty.warnings.map((warning) => warning.code)).toEqual(['no-text']);
  });
});
