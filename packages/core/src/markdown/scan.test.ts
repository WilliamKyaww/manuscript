import { describe, expect, it } from 'vitest';
import { analyseNote, maskNonProse, plainHeadingText, toSearchText } from './scan';

const targets = (text: string) => analyseNote(text).links.map((link) => link.target);

describe('analyseNote — wikilinks and embeds', () => {
  it('extracts targets, headings, block references and aliases', () => {
    const links = analyseNote(
      'See [[Paxos]], [[Raft#Leader election|elections]] and [[FLP#^proof]].',
    ).links;
    expect(links).toEqual([
      expect.objectContaining({
        syntax: 'wikilink',
        embed: false,
        target: 'Paxos',
        heading: null,
        alias: null,
      }),
      expect.objectContaining({ target: 'Raft', heading: 'Leader election', alias: 'elections' }),
      expect.objectContaining({ target: 'FLP', heading: null, blockRef: 'proof' }),
    ]);
  });

  it('recognises embeds and same-note heading links', () => {
    const links = analyseNote('![[diagram.png]]\n[[#Summary]]').links;
    expect(links[0]).toMatchObject({ embed: true, target: 'diagram.png' });
    expect(links[1]).toMatchObject({ target: '', heading: 'Summary' });
  });

  it('accepts the escaped pipe used inside tables', () => {
    const [link] = analyseNote(
      '| Concept | Note |\n|---|---|\n| CAP | [[CAP theorem\\|CAP]] |',
    ).links;
    expect(link).toMatchObject({ target: 'CAP theorem', alias: 'CAP' });
  });

  it('reports exact positions', () => {
    const text = 'line one\nAbout [[Raft]] here';
    const [link] = analyseNote(text).links;
    expect(link).toMatchObject({ line: 2, column: 6, offset: 15, length: 8, raw: '[[Raft]]' });
    expect(text.slice(link?.offset, (link?.offset ?? 0) + (link?.length ?? 0))).toBe('[[Raft]]');
  });

  it('ignores links in code, maths and comments', () => {
    const text = [
      'Real [[Prose]]',
      '```md',
      '[[In fence]]',
      '```',
      '~~~~',
      '[[In tilde fence]]',
      '~~~~',
      'Inline `[[In code]]` and ``[[Double `tick`]]``',
      '$$',
      '[[In display maths]]',
      '$$',
      'Inline $[[x]]$ maths',
      '<!-- [[In HTML comment]] -->',
      '%% [[In Obsidian comment]] %%',
      'Tail [[After]]',
    ].join('\n');
    expect(targets(text)).toEqual(['Prose', 'After']);
  });

  it('treats an unclosed fence as code to the end of the note', () => {
    expect(targets('[[Before]]\n```\n[[Never]]')).toEqual(['Before']);
  });

  it('does not treat currency as maths', () => {
    expect(targets('It costs $5 and [[Budget]] says $6.')).toEqual(['Budget']);
  });

  it('ignores links in frontmatter', () => {
    expect(targets('---\nsource: "[[Lecture 3]]"\n---\nBody [[Paxos]]')).toEqual(['Paxos']);
  });
});

describe('analyseNote — Markdown links', () => {
  it('records local links and images but not external URLs', () => {
    const links = analyseNote(
      '[Notes](Week%201/Consensus.md#Paxos) ![Diagram](<Attachments/flow chart.png>) [site](https://example.com) [anchor](#top) [mail](mailto:a@b.c)',
    ).links;
    expect(links).toEqual([
      expect.objectContaining({
        syntax: 'markdown',
        embed: false,
        target: 'Week 1/Consensus.md',
        heading: 'Paxos',
        alias: 'Notes',
      }),
      expect.objectContaining({
        syntax: 'markdown',
        embed: true,
        target: 'Attachments/flow chart.png',
        alias: 'Diagram',
      }),
    ]);
  });
});

describe('analyseNote — tags', () => {
  it('collects frontmatter and inline tags, normalised and unique', () => {
    const analysis = analyseNote(
      '---\ntags: [Exam, "#cs/distributed"]\n---\nRevise #consensus and #CS/distributed today #exam',
    );
    expect(analysis.tags).toEqual(['consensus', 'cs/distributed', 'exam']);
    expect(analysis.inlineTags.map((tag) => tag.tag)).toEqual([
      'consensus',
      'CS/distributed',
      'exam',
    ]);
  });

  it('does not mistake headings, numbers, URLs or code for tags', () => {
    const analysis = analyseNote(
      '# Heading\nIssue #123 in C# at https://site.com/#anchor and `#notatag` but #valid-tag/sub and (#paren)',
    );
    expect(analysis.tags).toEqual(['paren', 'valid-tag/sub']);
  });

  it('accepts comma-separated and list frontmatter tags', () => {
    expect(analyseNote('---\ntags: a, b\n---\n').tags).toEqual(['a', 'b']);
    expect(analyseNote('---\ntags:\n  - one\n  - two\n---\n').tags).toEqual(['one', 'two']);
  });
});

describe('analyseNote — headings', () => {
  it('extracts ATX headings with plain text and unique slugs', () => {
    const analysis = analyseNote(
      '# Consensus\n## **Paxos** and [[Raft|the Raft paper]]\n## Summary ##\n## Summary\n```\n# Not a heading\n```',
    );
    expect(
      analysis.headings.map(({ level, text, slug, line }) => ({ level, text, slug, line })),
    ).toEqual([
      { level: 1, text: 'Consensus', slug: 'consensus', line: 1 },
      { level: 2, text: 'Paxos and the Raft paper', slug: 'paxos-and-the-raft-paper', line: 2 },
      { level: 2, text: 'Summary', slug: 'summary', line: 3 },
      { level: 2, text: 'Summary', slug: 'summary-1', line: 4 },
    ]);
  });

  it('requires a space after the hashes', () => {
    expect(analyseNote('#tag\n#Heading').headings).toEqual([]);
  });

  it('strips inline markup from heading text', () => {
    expect(plainHeadingText('Why `Raft` is **easier** than [Paxos](paxos.md)')).toBe(
      'Why Raft is easier than Paxos',
    );
  });
});

describe('analyseNote — frontmatter fields', () => {
  it('reads known keys leniently', () => {
    const analysis = analyseNote(
      '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\ntitle: Consensus overview\ntype: lecture-notes\nmodule: COC251\nlecture: COC251/L03\naliases: [Consensus, Agreement]\ncreated: 2026-10-04\n---\n# Body',
    );
    expect(analysis).toMatchObject({
      frontmatterPresent: true,
      frontmatterError: null,
      id: 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7',
      title: 'Consensus overview',
      type: 'lecture-notes',
      module: 'COC251',
      lecture: 'COC251/L03',
      aliases: ['Consensus', 'Agreement'],
      created: '2026-10-04',
    });
  });

  it('reports invalid YAML without failing', () => {
    const analysis = analyseNote('---\ntitle: [unclosed\n---\nBody [[Link]]');
    expect(analysis.frontmatterError).toMatch(/not valid YAML/);
    expect(analysis.frontmatter).toEqual({});
    expect(analysis.links.map((link) => link.target)).toEqual(['Link']);
  });

  it('handles CRLF files and a byte-order mark', () => {
    const analysis = analyseNote(
      '﻿---\r\ntitle: Windows note\r\n---\r\n# Heading\r\nSee [[Other]]\r\n',
    );
    expect(analysis.title).toBe('Windows note');
    expect(analysis.headings[0]).toMatchObject({ text: 'Heading', line: 4 });
    expect(analysis.links[0]).toMatchObject({ target: 'Other', line: 5 });
  });
});

describe('analyseNote — words and search text', () => {
  it('counts prose words but not code or frontmatter', () => {
    const analysis = analyseNote(
      "---\ntitle: x\n---\nRaft's leader election\n```\nconst a = 1\n```\nworks well",
    );
    expect(analysis.wordCount).toBe(5);
  });

  it('keeps code and link text in the search text but drops markup', () => {
    const text = toSearchText(
      '# Title\n> [!note] Callout\n**Bold** [[Target|alias]] [link](x.md) ==mark==\n`code()`',
    );
    expect(text).toContain('Title');
    expect(text).toContain('Callout');
    expect(text).toContain('Bold alias link mark');
    expect(text).toContain('`code()`');
    expect(text).not.toContain('**');
    expect(text).not.toContain('[[');
  });
});

describe('maskNonProse', () => {
  it('preserves length and line breaks', () => {
    const text = 'a `b` c\n```\ncode\n```\n$x$ d';
    const masked = maskNonProse(text);
    expect(masked).toHaveLength(text.length);
    expect(masked.split('\n')).toHaveLength(text.split('\n').length);
    expect(masked).toBe('a     c\n   \n    \n   \n    d');
  });
});
