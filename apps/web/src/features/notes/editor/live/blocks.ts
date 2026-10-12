import { syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
  type Transaction,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { maskCode } from '@skb/core/markdown';
import { renderInline } from './inline-render';
import { MathWidget } from './math';
import { type ParsedTable, parseTable } from './table';

/**
 * Block-level live preview (Phase 25): pipe tables drawn as tables and `$$ … $$` maths drawn as
 * formulas while the cursor is elsewhere. Decorations that replace whole lines (and so line breaks)
 * can only come from a state field, which is why these are not part of the view plugin in
 * `live-preview.ts`. Move the cursor into one, or click it, and its source comes back to be edited.
 */

/** Notes bigger than this are not scanned for display maths (tables come from the syntax tree). */
const MAX_SCAN = 400_000;

class TableWidget extends WidgetType {
  constructor(
    readonly table: ParsedTable,
    readonly from: number,
    /** The table's source, for equality: an unchanged table is not redrawn. */
    readonly source: string,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget';
    const table = document.createElement('table');
    const row = (cells: string[], tag: 'th' | 'td', offset: number) => {
      const tr = document.createElement('tr');
      tr.dataset.offset = String(offset);
      cells.forEach((cell, column) => {
        const element = document.createElement(tag);
        const align = this.table.align[column];
        if (align) element.style.textAlign = align;
        element.append(renderInline(cell));
        tr.append(element);
      });
      return tr;
    };
    const head = document.createElement('thead');
    head.append(row(this.table.header, 'th', 0));
    const body = document.createElement('tbody');
    for (const entry of this.table.rows) body.append(row(entry.cells, 'td', entry.offset));
    table.append(head, body);
    wrapper.append(table);

    // A click puts the cursor in the row's source, which shows the table as text to edit.
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('tr');
      const offset = Number(target?.dataset.offset ?? 0);
      view.dispatch({ selection: { anchor: this.from + offset }, scrollIntoView: true });
      view.focus();
    });
    return wrapper;
  }

  override get estimatedHeight(): number {
    return 34 * (this.table.rows.length + 1);
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

interface Block {
  from: number;
  to: number;
  widget: WidgetType;
}

function tables(state: EditorState): Block[] {
  const found: Block[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      // Tables inside quotes and lists carry prefixes on each line; they stay as source.
      if (node.node.parent?.name !== 'Document') return false;
      const source = state.sliceDoc(node.from, node.to);
      const parsed = parseTable(source.split('\n'));
      if (parsed)
        found.push({
          from: node.from,
          to: node.to,
          widget: new TableWidget(parsed, node.from, source),
        });
      return false;
    },
  });
  return found;
}

function displayMaths(state: EditorState): Block[] {
  if (state.doc.length > MAX_SCAN) return [];
  const text = state.doc.toString();
  if (!text.includes('$$')) return [];
  const masked = maskCode(text);
  const found: Block[] = [];
  for (const match of masked.matchAll(/\$\$([\s\S]+?)\$\$/gu)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    // Only formulas that fill whole lines are drawn as blocks; `a $$x$$ b` stays in its sentence.
    const lineStart = state.doc.lineAt(from);
    const lineEnd = state.doc.lineAt(to);
    if (text.slice(lineStart.from, from).trim() !== '') continue;
    if (text.slice(to, lineEnd.to).trim() !== '') continue;
    const tex = (match[1] ?? '').trim();
    if (tex === '') continue;
    found.push({ from: lineStart.from, to: lineEnd.to, widget: new MathWidget(tex, true) });
  }
  return found;
}

function build(state: EditorState): DecorationSet {
  const blocks = [...tables(state), ...displayMaths(state)]
    .filter((block) => !touches(state, block.from, block.to))
    .sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const block of blocks) {
    if (block.from < last) continue;
    builder.add(block.from, block.to, Decoration.replace({ widget: block.widget, block: true }));
    last = block.to;
  }
  return builder.finish();
}

function changed(transaction: Transaction): boolean {
  return (
    transaction.docChanged ||
    !transaction.startState.selection.eq(transaction.state.selection) ||
    syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
  );
}

export const liveBlocksField = StateField.define<DecorationSet>({
  create: (state) => build(state),
  update: (value, transaction) =>
    changed(transaction) ? build(transaction.state) : value.map(transaction.changes),
  provide: (field) => EditorView.decorations.from(field),
});

export const liveBlocks: Extension = liveBlocksField;
