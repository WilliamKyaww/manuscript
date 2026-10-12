import type { ChangeSpec, EditorState, SelectionRange } from '@codemirror/state';
import type { Command } from './format';

/**
 * Blocks of the selection (Phase 26): "Turn into" in the selection toolbar and the Paragraph menu —
 * headings, lists, tasks, quotes, callouts and code blocks — by rewriting the start of each line.
 * Applied to lines that are all of the kind already, it turns them back into text.
 */

export type BlockKind =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'callout'
  | 'code';

export const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: 'Text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
  bullet: 'Bulleted list',
  numbered: 'Numbered list',
  task: 'Task list',
  quote: 'Quote',
  callout: 'Callout',
  code: 'Code block',
};

const PREFIX =
  /^(\s*)(?:(#{1,6})\s+|([-*+])\s+\[(.)\]\s+|([-*+])\s+|(\d+)[.)]\s+|(>\s?(?:\[![^\]]*\][+-]?\s*)?))?/u;

interface LinePrefix {
  indent: string;
  kind: BlockKind;
  /** Length of indent and prefix. */
  length: number;
}

function prefixOf(text: string): LinePrefix {
  const match = PREFIX.exec(text);
  const indent = match?.[1] ?? '';
  const length = match?.[0].length ?? 0;
  if (!match || length === indent.length)
    return { indent, kind: 'paragraph', length: indent.length };
  if (match[2]) return { indent, kind: `heading${match[2].length}` as BlockKind, length };
  if (match[4] !== undefined) return { indent, kind: 'task', length };
  if (match[5]) return { indent, kind: 'bullet', length };
  if (match[6]) return { indent, kind: 'numbered', length };
  if (match[7]) return { indent, kind: match[7].includes('[!') ? 'callout' : 'quote', length };
  return { indent, kind: 'paragraph', length: indent.length };
}

/** The kind of block the cursor (the selection's head) is in. */
export function blockKindAt(state: EditorState, position = state.selection.main.head): BlockKind {
  const line = state.doc.lineAt(position);
  // Inside a fenced code block: look for an opening fence above with no closing one in between.
  let fences = 0;
  for (let n = 1; n < line.number; n += 1)
    if (/^\s*(```|~~~)/u.test(state.doc.line(n).text)) fences += 1;
  if (fences % 2 === 1) return 'code';
  const kind = prefixOf(line.text).kind;
  if (kind === 'quote' || kind === 'callout') {
    // A callout's later lines are `> text`: the first line of the quote decides.
    for (let n = line.number; n >= 1; n -= 1) {
      const text = state.doc.line(n).text;
      if (!/^\s*>/u.test(text)) break;
      if (/^\s*>\s?\[!/u.test(text)) return 'callout';
    }
    return 'quote';
  }
  return kind;
}

function linesOf(state: EditorState, range: SelectionRange) {
  const first = state.doc.lineAt(range.from).number;
  // A selection ending at the very start of a line does not take that line.
  const endLine = state.doc.lineAt(range.to);
  const last =
    range.to === endLine.from && range.to > range.from ? endLine.number - 1 : endLine.number;
  const lines = [];
  for (let n = first; n <= Math.max(first, last); n += 1) lines.push(state.doc.line(n));
  return lines;
}

/** Turns the lines of the selection into a kind of block, or back into text when they all are. */
export function setBlock(kind: BlockKind): Command {
  return ({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    for (const range of state.selection.ranges) {
      const lines = linesOf(state, range);
      const all = lines.every((line) => prefixOf(line.text).kind === kind);
      const target: BlockKind = all && kind !== 'paragraph' ? 'paragraph' : kind;
      if (target === 'code') {
        const first = lines[0];
        const last = lines.at(-1);
        if (!first || !last) continue;
        changes.push({ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' });
        continue;
      }
      let number = 1;
      lines.forEach((line, index) => {
        const current = prefixOf(line.text);
        let prefix = '';
        if (target.startsWith('heading')) prefix = `${'#'.repeat(Number(target.slice(7)))} `;
        else if (target === 'bullet') prefix = '- ';
        else if (target === 'numbered') prefix = `${number++}. `;
        else if (target === 'task') prefix = '- [ ] ';
        else if (target === 'quote') prefix = '> ';
        else if (target === 'callout') prefix = index === 0 ? '> [!note] ' : '> ';
        // Headings and quotes start at the margin; lists keep their indentation.
        const keepIndent = target === 'bullet' || target === 'numbered' || target === 'task';
        const insert = (keepIndent ? current.indent : '') + prefix;
        changes.push({ from: line.from, to: line.from + current.length, insert });
      });
    }
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}
