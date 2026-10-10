import { type Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

/**
 * Front matter in the editor. The Markdown parser reads the lines before a closing `---` as a setext
 * heading (a paragraph underlined with dashes), so a note's properties were drawn as a big bold title.
 * The block is found the way the notes parser finds it — at the very start, closed by `---` or `...` —
 * and its lines are given a class that undoes the heading look: small, monospace, muted.
 */

const FENCE = /^---[ \t]*$/u;
const CLOSING = /^(?:---|\.\.\.)[ \t]*$/u;
/** Front matter that runs on for more lines than this is not front matter. */
const MAX_LINES = 300;

const line = Decoration.line({ class: 'cm-frontmatter' });

/** The number of lines front matter takes at the start of the document, or 0. */
export function frontmatterLines(lineAt: (n: number) => string | null): number {
  const first = lineAt(1);
  if (first === null || !FENCE.test(first)) return 0;
  for (let n = 2; n <= MAX_LINES; n += 1) {
    const text = lineAt(n);
    if (text === null) return 0;
    if (CLOSING.test(text)) return n;
  }
  return 0;
}

const field = StateField.define<DecorationSet>({
  create: (state) => build(state.doc),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.newDoc) : value),
  provide: (f) => EditorView.decorations.from(f),
});

function build(doc: {
  lines: number;
  line(n: number): { from: number; text: string };
}): DecorationSet {
  const count = frontmatterLines((n) => (n <= doc.lines ? doc.line(n).text : null));
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 1; n <= count; n += 1) builder.add(doc.line(n).from, doc.line(n).from, line);
  return builder.finish();
}

const theme = EditorView.theme({
  '.cm-frontmatter, .cm-frontmatter span': {
    fontFamily: 'var(--skb-font-mono)',
    fontSize: '0.85em',
    fontWeight: '400',
    fontStyle: 'normal',
    textDecoration: 'none',
    color: 'var(--skb-text-subtle)',
  },
});

export const frontmatterStyle: Extension = [field, theme];
