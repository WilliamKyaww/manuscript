import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { frontmatterLines } from './frontmatter';
import { hiddenRanges, livePreview } from './live-preview';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

/** The text as drawn: the document without the hidden marks. */
function drawn(doc: string, cursor: number): string {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage }), livePreview],
  });
  ensureSyntaxTree(state, doc.length, 5_000);
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  let text = '';
  let at = 0;
  for (const range of hiddenRanges(view)) {
    text += doc.slice(at, range.from);
    at = range.to;
  }
  return text + doc.slice(at);
}

describe('live preview', () => {
  const doc = '# Raft\n\nSplit into **leader election** and *safety*, ~~not~~ `log`.\n\nEnd';

  it('hides the marks of every element away from the cursor', () => {
    expect(drawn(doc, doc.length)).toBe(
      'Raft\n\nSplit into leader election and safety, not log.\n\nEnd',
    );
  });

  it('shows the marks of the element under the cursor, so that it can be edited', () => {
    const inBold = doc.indexOf('leader');
    expect(drawn(doc, inBold)).toBe(
      'Raft\n\nSplit into **leader election** and safety, not log.\n\nEnd',
    );
    expect(drawn(doc, 3)).toContain('# Raft');
  });

  it('shows a link as its text, and a wikilink without its brackets', () => {
    const links = 'See [the paper](https://raft.github.io "Raft") and [[Paxos]].\n\nEnd';
    expect(drawn(links, links.length)).toBe('See the paper and Paxos.\n\nEnd');
    // Under the cursor it is as written, to be edited.
    expect(drawn(links, links.indexOf('Paxos'))).toContain('[[Paxos]]');
  });

  it('leaves code blocks alone', () => {
    const code = '```go\nn.term++\n```\n\nEnd';
    expect(drawn(code, code.length)).toBe(code);
  });
});

describe('front matter', () => {
  const lines = (text: string) => {
    const all = text.split('\n');
    return (n: number) => all[n - 1] ?? null;
  };

  it('is found at the very start and closed by --- or ...', () => {
    expect(frontmatterLines(lines('---\nmodule: COC251\ntags: [a]\n---\n# Title'))).toBe(4);
    expect(frontmatterLines(lines('---\nmodule: COC251\n...\nBody'))).toBe(3);
  });

  it('is not front matter when it does not start the note or is never closed', () => {
    expect(frontmatterLines(lines('# Title\n---\nmodule: x\n---'))).toBe(0);
    expect(frontmatterLines(lines('---\nmodule: COC251\nno end'))).toBe(0);
    expect(frontmatterLines(lines(''))).toBe(0);
  });
});
