import { syntaxTree } from '@codemirror/language';
import type { Extension, Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { obsidianCommentRanges, parseCalloutHead } from '@skb/core/markdown';
import { frontmatterLines } from './frontmatter';
import { liveBlocks } from './live/blocks';
import { livePreviewContext } from './live/context';
import { type Item, scanLine } from './live/lines';
import { linkItems } from './live/links';
import { liveTheme } from './live/theme';
import { CalloutTitleWidget, CheckboxWidget, ListMarkerWidget } from './live/widgets';

/**
 * Live preview (tasks 20.05, Phase 25): the marks of Markdown — the `#` of a heading, the `**` around
 * bold, the brackets of a link, a list's `-`, a quote's `>` — are hidden while the cursor is not in the
 * element they belong to, and some elements are drawn as what they are: bullets, task checkboxes,
 * callouts, rules, highlights, maths, images, web links with their mark and GitHub links as mentions
 * (`live/links.ts`), and (in `live/blocks.ts`) tables. Move the cursor into an element and its source
 * comes back to be edited. The text is never changed: only what is drawn.
 */

const hidden = Decoration.replace({});
const line = (attributes: Record<string, string>) => Decoration.line({ attributes });

/** Mark nodes, and which kind of parent each is hidden in. Links are handled whole, below. */
const MARKS: Record<string, (parent: string) => boolean> = {
  HeaderMark: (parent) => parent.startsWith('ATXHeading'),
  EmphasisMark: (parent) => parent === 'Emphasis' || parent === 'StrongEmphasis',
  StrikethroughMark: (parent) => parent === 'Strikethrough',
  CodeMark: (parent) => parent === 'InlineCode',
};

const TASK = /^[ \t]+\[(.)\](?=[ \t]|$)/u;
/** Notes bigger than this are not scanned for `%%` comments on each change. */
const MAX_COMMENT_SCAN = 400_000;

interface Hide {
  from: number;
  to: number;
}

interface Collected {
  items: Item[];
}

function collect(view: EditorView, comments: readonly Hide[]): Collected {
  const { state } = view;
  const doc: Text = state.doc;
  const selection = state.selection.ranges;
  const touches = (from: number, to: number) =>
    selection.some((range) => range.from <= to && range.to >= from);
  const lineTouched = (position: number) => {
    const at = doc.lineAt(position);
    return touches(at.from, at.to);
  };
  const items: Item[] = [];
  const addHide = (from: number, to: number) => {
    if (to > from) items.push({ from, to, deco: hidden, hide: true, replace: true });
  };
  const addLine = (position: number, deco: Decoration) =>
    items.push({ from: position, to: position, deco });
  /** Code and comments, where no mark is drawn as anything. */
  const skip: Hide[] = [...comments];
  /** Whole-line code, where the line rules do not apply at all. */
  const blocks: Hide[] = [];
  const front = frontmatterLines((n) => (n <= doc.lines ? doc.line(n).text : null));
  if (front > 0) blocks.push({ from: 0, to: doc.line(front).to });

  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const { name } = node;
        if (name === 'Link' || name === 'Autolink') {
          // [text](address "title") is drawn as its text; <address> as the address. Only links with
          // an address: [[wikilinks]] and bare [brackets] stay as written.
          items.push(...linkItems(state, node.node, touches));
          return;
        }
        if (name === 'URL') {
          const parent = node.node.parent?.name;
          if (parent !== 'Link' && parent !== 'Autolink')
            items.push(...linkItems(state, node.node, touches));
          return;
        }
        if (name === 'InlineCode') {
          skip.push({ from: node.from, to: node.to });
          return;
        }
        if (name === 'FencedCode' || name === 'CodeBlock') {
          blocks.push({ from: node.from, to: node.to });
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let n = first; n <= last; n += 1) {
            const at = doc.line(n);
            const edge =
              n === first ? ' cm-codeblock-first' : n === last ? ' cm-codeblock-last' : '';
            addLine(at.from, line({ class: `cm-codeblock${edge}` }));
          }
          return false;
        }
        if (name === 'HorizontalRule') {
          if (node.node.parent?.name === 'Document' && !lineTouched(node.from))
            addLine(node.from, line({ class: 'cm-hr' }));
          return;
        }
        if (name === 'Table') {
          // A table being edited is shown as source, in the monospace of a table.
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let n = first; n <= last; n += 1)
            addLine(doc.line(n).from, line({ class: 'cm-table-source' }));
          return;
        }
        if (name === 'Comment' || name === 'CommentBlock') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-comment' }),
          });
          skip.push({ from: node.from, to: node.to });
          return false;
        }
        if (name === 'Blockquote') {
          quote(node.node);
          return;
        }
        if (name === 'QuoteMark') {
          const at = doc.lineAt(node.from);
          if (touches(at.from, at.to)) return;
          const space = doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0;
          addHide(node.from, node.to + space);
          return;
        }
        if (name === 'ListMark') {
          listItem(node.node);
          return;
        }
        const applies = MARKS[name];
        if (!applies) return;
        const parent = node.node.parent;
        if (!parent || !applies(parent.name)) return;
        // The element under the cursor keeps its marks, so that it can be edited.
        if (touches(parent.from, parent.to)) return;
        let end = node.to;
        // The space that follows a heading's #s goes with them.
        if (name === 'HeaderMark' && state.sliceDoc(end, end + 1) === ' ') end += 1;
        addHide(node.from, end);
      },
    });
  }

  /** The outermost blockquote draws the bar; every blockquote may be a callout. */
  function quote(node: SyntaxNode): void {
    const outer = node.parent?.name !== 'Blockquote';
    const first = doc.lineAt(node.from);
    const head = parseCalloutHead(first.text.replace(/^[\s>]+/u, ''));
    const lastLine = doc.lineAt(node.to).number;
    if (outer) {
      for (let n = first.number; n <= lastLine; n += 1) {
        const at = doc.line(n);
        addLine(
          at.from,
          head
            ? line({
                class: 'cm-callout',
                'data-callout': head.type,
                ...(n === first.number ? { 'data-callout-first': 'true' } : {}),
                ...(n === lastLine ? { 'data-callout-last': 'true' } : {}),
              })
            : line({ class: 'cm-quote' }),
        );
      }
    }
    if (!head || touches(first.from, first.to)) return;
    // `> [!tip] Title`: the marker becomes an icon (with the type's name when there is no title).
    const markerStart =
      first.from + (first.text.length - first.text.replace(/^[\s>]+/u, '').length);
    const widget = new CalloutTitleWidget(
      head.type,
      head.title === ''
        ? head.name.charAt(0).toUpperCase() + head.name.slice(1).toLowerCase()
        : null,
    );
    items.push({
      from: markerStart,
      to: markerStart + head.markerLength,
      deco: Decoration.replace({ widget }),
      replace: true,
    });
    if (head.title !== '')
      items.push({
        from: markerStart + head.markerLength,
        to: first.to,
        deco: Decoration.mark({ class: 'cm-callout-title' }),
      });
  }

  function listItem(mark: SyntaxNode): void {
    const at = doc.lineAt(mark.from);
    if (touches(at.from, at.to)) return;
    let depth = 0;
    for (let up = mark.parent; up; up = up.parent) if (up.name === 'ListItem') depth += 1;
    const before = doc.sliceString(at.from, mark.from);
    const plain = /^[ \t]*$/u.test(before);
    const marker = doc.sliceString(mark.from, mark.to);
    const task = TASK.exec(doc.sliceString(mark.to, at.to));
    const space = doc.sliceString(mark.to, mark.to + 1) === ' ' ? 1 : 0;
    if (task) {
      const status = task[1] ?? ' ';
      const bracket = mark.to + task[0].indexOf('[');
      const end = mark.to + task[0].length;
      items.push({
        from: mark.from,
        to: end,
        deco: Decoration.replace({ widget: new CheckboxWidget(status, bracket + 1) }),
        replace: true,
      });
      if (status.toLowerCase() === 'x' && end < at.to)
        items.push({ from: end, to: at.to, deco: Decoration.mark({ class: 'cm-task-done' }) });
    } else {
      const ordered = /^\d/u.test(marker);
      items.push({
        from: mark.from,
        to: mark.to + space,
        deco: Decoration.replace({ widget: new ListMarkerWidget(ordered ? marker : null) }),
        replace: true,
      });
    }
    if (plain) {
      addHide(at.from, mark.from);
      addLine(
        at.from,
        line({ class: 'cm-list-line', style: `--list-depth: ${Math.max(0, depth - 1)}` }),
      );
    }
  }

  // Line rules (highlights, links, maths, footnotes, block ids) outside code, comments and front matter.
  const context = state.facet(livePreviewContext);
  const inside = (list: readonly Hide[], position: number) =>
    list.some((range) => range.from <= position && position < range.to);
  for (const { from, to } of view.visibleRanges) {
    let position = from;
    while (position <= to) {
      const at = doc.lineAt(position);
      position = at.to + 1;
      if (inside(blocks, at.from) || at.text === '') continue;
      items.push(
        ...scanLine({
          text: at.text,
          offset: at.from,
          touched: touches,
          skipped: (pos) => inside(skip, pos) || inside(blocks, pos),
          imageUrl: (target) => context.imageUrl(target),
        }),
      );
    }
  }
  for (const range of comments) {
    if (view.visibleRanges.some((v) => v.from <= range.to && v.to >= range.from))
      items.push({
        from: range.from,
        to: range.to,
        deco: Decoration.mark({ class: 'cm-comment' }),
      });
  }
  return { items };
}

/** Sorted, with no two replacing decorations overlapping (the later one is dropped). */
function ordered(items: readonly Item[]): Item[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.from - b.from || a.to - b.to || Number(Boolean(a.replace)) - Number(Boolean(b.replace)),
  );
  const result: Item[] = [];
  let replacedTo = -1;
  for (const item of sorted) {
    if (item.replace) {
      if (item.from < replacedTo) continue;
      replacedTo = item.to;
    }
    result.push(item);
  }
  return result;
}

function commentRanges(doc: Text): Hide[] {
  if (doc.length > MAX_COMMENT_SCAN) return [];
  const text = doc.toString();
  if (!text.includes('%%')) return [];
  return obsidianCommentRanges(text).map(({ start, end }) => ({ from: start, to: end }));
}

/** The marks hidden in the visible part of the document, in order (exported for tests). */
export function hiddenRanges(view: EditorView): Hide[] {
  return ordered(collect(view, commentRanges(view.state.doc)).items)
    .filter((item) => item.hide)
    .map(({ from, to }) => ({ from, to }));
}

/** Everything live preview draws in the visible part of the document (exported for tests). */
export function liveItems(view: EditorView): Item[] {
  return ordered(collect(view, commentRanges(view.state.doc)).items);
}

function build(
  view: EditorView,
  comments: readonly Hide[],
): { all: DecorationSet; atomic: DecorationSet } {
  const result = ordered(collect(view, comments).items);
  return {
    all: Decoration.set(
      result.map((item) => item.deco.range(item.from, item.to)),
      true,
    ),
    // The cursor steps over what is replaced instead of stopping inside something it cannot see.
    atomic: Decoration.set(
      result.filter((item) => item.replace).map((item) => item.deco.range(item.from, item.to)),
      true,
    ),
  };
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    comments: Hide[];
    constructor(view: EditorView) {
      this.comments = commentRanges(view.state.doc);
      ({ all: this.decorations, atomic: this.atomic } = build(view, this.comments));
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.comments = commentRanges(update.state.doc);
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        ({ all: this.decorations, atomic: this.atomic } = build(update.view, this.comments));
    }
  },
  { decorations: (instance) => instance.decorations },
);

export const livePreview: Extension = [
  plugin,
  EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  liveBlocks,
  liveTheme,
];
