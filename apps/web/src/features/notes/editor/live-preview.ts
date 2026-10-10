import { syntaxTree } from '@codemirror/language';
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Live preview (task 20.05): the marks of Markdown — the `#` of a heading, the `**` around bold, the
 * backticks of inline code, the brackets and address of a link — are hidden while the cursor is not in
 * the element they belong to, so the text reads as it will look. Move the cursor into a line and the
 * marks come back to be edited. The text is never changed: only what is drawn.
 */

const hidden = Decoration.replace({});

/** Mark nodes, and which kind of parent each is hidden in. Links are handled whole, below. */
const MARKS: Record<string, (parent: string) => boolean> = {
  HeaderMark: (parent) => parent.startsWith('ATXHeading'),
  EmphasisMark: (parent) => parent === 'Emphasis' || parent === 'StrongEmphasis',
  StrikethroughMark: (parent) => parent === 'Strikethrough',
  CodeMark: (parent) => parent === 'InlineCode',
};

interface Hide {
  from: number;
  to: number;
}

/** The marks hidden in the visible part of the document, in order (exported for tests). */
export function hiddenRanges(view: EditorView): Hide[] {
  const { state } = view;
  const selection = state.selection.ranges;
  const touches = (from: number, to: number) =>
    selection.some((range) => range.from <= to && range.to >= from);
  const found: Hide[] = [];
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Link') {
          // [text](address "title") is drawn as its text: the [ before, and everything from ] on.
          // Only links with an address: [[wikilinks]] and bare [brackets] stay as written.
          const link = node.node;
          const marks = link.getChildren('LinkMark');
          const [open, close] = marks;
          if (!open || !close || !link.getChild('URL') || touches(link.from, link.to)) return;
          found.push({ from: open.from, to: open.to }, { from: close.from, to: link.to });
          return;
        }
        const applies = MARKS[node.name];
        if (!applies) return;
        const parent = node.node.parent;
        if (!parent || !applies(parent.name)) return;
        // The element under the cursor keeps its marks, so that it can be edited.
        if (touches(parent.from, parent.to)) return;
        let end = node.to;
        // The space that follows a heading's #s goes with them.
        if (node.name === 'HeaderMark' && state.sliceDoc(end, end + 1) === ' ') end += 1;
        found.push({ from: node.from, to: end });
      },
    });
  }
  return found.sort((a, b) => a.from - b.from || a.to - b.to);
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const range of hiddenRanges(view)) {
    if (range.from < last || range.to <= range.from) continue;
    builder.add(range.from, range.to, hidden);
    last = range.to;
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = build(update.view);
    }
  },
  { decorations: (instance) => instance.decorations },
);

export const livePreview: Extension = [
  plugin,
  // The cursor steps over a hidden mark instead of stopping inside something that cannot be seen.
  EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
];
