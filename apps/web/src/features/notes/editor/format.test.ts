import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  type Command,
  clearFormatting,
  setHighlight,
  stripFormatting,
  toggleInline,
} from './format';
import { blockKindAt, setBlock } from './format-blocks';
import { insertSnippet, wrapMarkdownLink, wrapWikilink } from './format-insert';

/**
 * Formatting the selection (Phase 26). Documents are written with the selection marked: `[` and `]`
 * around selected text, `|` for a cursor.
 */

function stateOf(marked: string): EditorState {
  const cursor = marked.indexOf('|');
  if (cursor !== -1)
    return EditorState.create({
      doc: marked.replace('|', ''),
      selection: EditorSelection.cursor(cursor),
    });
  const from = marked.indexOf('[');
  const to = marked.indexOf(']', from) - 1;
  return EditorState.create({
    doc: marked.slice(0, from) + marked.slice(from + 1, to + 1) + marked.slice(to + 2),
    selection: EditorSelection.range(from, to),
  });
}

function marked(state: EditorState): string {
  const { from, to, empty } = state.selection.main;
  const doc = state.doc.toString();
  if (empty) return `${doc.slice(0, from)}|${doc.slice(from)}`;
  return `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`;
}

function run(command: Command, text: string): string {
  let state = stateOf(text);
  command({ state, dispatch: (transaction) => (state = transaction.state) });
  return marked(state);
}

describe('inline formats', () => {
  it('wraps the selection, and unwraps it again', () => {
    expect(run(toggleInline('bold'), 'a [word] b')).toBe('a **[word]** b');
    expect(run(toggleInline('bold'), 'a **[word]** b')).toBe('a [word] b');
    expect(run(toggleInline('bold'), 'a [**word**] b')).toBe('a [word] b');
    expect(run(toggleInline('strikethrough'), '[old]')).toBe('~~[old]~~');
    expect(run(toggleInline('highlight'), '[key]')).toBe('==[key]==');
    expect(run(toggleInline('code'), '[x]')).toBe('`[x]`');
    expect(run(toggleInline('maths'), '[x^2]')).toBe('$[x^2]$');
    expect(run(toggleInline('underline'), '[u]')).toBe('<u>[u]</u>');
    expect(run(toggleInline('comment'), '[hidden]')).toBe('%%[hidden]%%');
  });

  it('tells italic from half of bold', () => {
    expect(run(toggleInline('italic'), '**[bold]**')).toBe('***[bold]***');
    expect(run(toggleInline('italic'), '***[both]***')).toBe('**[both]**');
    expect(run(toggleInline('bold'), '***[both]***')).toBe('*[both]*');
    expect(run(toggleInline('italic'), '*[it]*')).toBe('[it]');
  });

  it('keeps spaces at the edges outside the marks', () => {
    expect(run(toggleInline('bold'), 'a[ word ]b')).toBe('a **[word]** b');
  });

  it('puts the cursor between new marks when nothing is selected', () => {
    expect(run(toggleInline('bold'), 'a | b')).toBe('a **|** b');
    expect(run(toggleInline('bold'), 'a **|** b')).toBe('a | b');
  });
});

describe('highlights and clearing', () => {
  it('highlights in a colour, recolours and removes', () => {
    expect(run(setHighlight('green'), 'a [key] b')).toBe('a ==🟢[key]== b');
    expect(run(setHighlight('blue'), 'a ==🟢[key]== b')).toBe('a ==🔵[key]== b');
    expect(run(setHighlight('default'), 'a ==🟢[key]== b')).toBe('a ==[key]== b');
    expect(run(setHighlight(null), 'a ==🟢[key]== b')).toBe('a [key] b');
  });

  it('clears inline formats inside and just around the selection, not maths or links', () => {
    expect(run(clearFormatting, '[**bold** and *it* and ~~s~~]')).toBe('[bold and it and s]');
    expect(run(clearFormatting, 'x **[bold]** y')).toBe('x [bold] y');
    expect(stripFormatting('$x$ and [a](b) and snake_case_name')).toBe(
      '$x$ and [a](b) and snake_case_name',
    );
    expect(stripFormatting('<u>u</u> ==🟢g== `c`')).toBe('u g c');
  });
});

describe('blocks', () => {
  it('turns lines into headings, lists, tasks and quotes, and back', () => {
    expect(run(setBlock('heading2'), '[Title]')).toBe('## [Title]');
    expect(run(setBlock('heading1'), '## [Title]')).toBe('# [Title]');
    expect(run(setBlock('bullet'), '[a\nb]')).toBe('- [a\n- b]');
    expect(run(setBlock('numbered'), '[a\nb]')).toBe('1. [a\n2. b]');
    expect(run(setBlock('task'), '- [a]')).toBe('- [ ] [a]');
    expect(run(setBlock('bullet'), '- [a]')).toBe('[a]');
    expect(run(setBlock('quote'), '[a]')).toBe('> [a]');
    expect(run(setBlock('paragraph'), '### [a]')).toBe('[a]');
    expect(run(setBlock('callout'), '[a\nb]')).toBe('> [!note] [a\n> b]');
  });

  it('keeps a list item’s indentation and wraps code', () => {
    expect(run(setBlock('task'), '  - [x]')).toBe('  - [ ] [x]');
    expect(run(setBlock('code'), '[a]')).toBe('```\n[a]\n```');
  });

  it('knows the block the cursor is in', () => {
    expect(blockKindAt(stateOf('### Ti|tle'))).toBe('heading3');
    expect(blockKindAt(stateOf('- [ ] ta|sk'))).toBe('task');
    expect(blockKindAt(stateOf('> [!tip] T\n> bo|dy'))).toBe('callout');
    expect(blockKindAt(stateOf('```\nco|de\n```'))).toBe('code');
    expect(blockKindAt(stateOf('pl|ain'))).toBe('paragraph');
  });
});

describe('links and insertions', () => {
  it('links the selection to a note or to the web', () => {
    expect(run(wrapWikilink, 'see [Raft] now')).toBe('see [[Raft]]| now');
    expect(run(wrapWikilink, 'see | now')).toBe('see [[|]] now');
    expect(run(wrapMarkdownLink('https://example.org'), '[paper]')).toBe(
      '[paper](https://example.org)|',
    );
    expect(run(wrapMarkdownLink(), '[paper]')).toBe('[paper](|)');
    expect(run(wrapMarkdownLink(), '[https://example.org]')).toBe('[|](https://example.org)');
  });

  it('inserts footnotes with the next number, and blocks on lines of their own', () => {
    expect(run(insertSnippet('footnote'), 'A[^1] claim|\n\n[^1]: x')).toBe(
      'A[^1] claim[^2]\n\n[^1]: x\n\n[^2]: |',
    );
    expect(run(insertSnippet('rule'), 'text|')).toBe('text\n---\n|');
    expect(run(insertSnippet('callout'), '|')).toBe('> [!note] Title\n> |');
    expect(run(insertSnippet('codeBlock'), '|')).toBe('```\n|\n```\n');
  });
});
