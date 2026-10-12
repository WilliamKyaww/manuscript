import { EditorSelection, type EditorState, type Transaction } from '@codemirror/state';

/**
 * Formatting the selection (Phase 26), as Obsidian writes it: the commands behind the selection
 * toolbar, the editor's right-click menu and its shortcuts. Each toggles: applied to text that
 * already has the format, it takes it away. They work on every selection range and only ever change
 * the Markdown text (undoable like typing).
 */

export interface Target {
  state: EditorState;
  dispatch(transaction: Transaction): void;
}
export type Command = (target: Target) => boolean;

/** Inline formats: the marks written before and after the text. */
export const INLINE = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  strikethrough: ['~~', '~~'],
  highlight: ['==', '=='],
  code: ['`', '`'],
  maths: ['$', '$'],
  comment: ['%%', '%%'],
} as const;
export type InlineFormat = keyof typeof INLINE;

const run = (text: string, at: number, step: 1 | -1, char: string) => {
  let count = 0;
  for (let i = step === 1 ? at : at - 1; i >= 0 && i < text.length && text[i] === char; i += step)
    count += 1;
  return count;
};

/**
 * Whether [from, to) is wrapped in `open`/`close` just outside it. Asterisks are counted, so that
 * italic is not mistaken for half of bold: `*` is present around a run of one or three, `**` around
 * two or three.
 */
function wrappedOutside(state: EditorState, from: number, to: number, open: string, close: string) {
  const before = state.sliceDoc(Math.max(0, from - 3), from);
  const after = state.sliceDoc(to, to + 3);
  if (open === '*' || open === '**') {
    const left = run(before, before.length, -1, '*');
    const right = run(after, 0, 1, '*');
    const ok = (n: number) => (open === '*' ? n === 1 || n === 3 : n === 2 || n === 3);
    return ok(left) && ok(right);
  }
  return before.endsWith(open) && after.startsWith(close);
}

function wrappedInside(text: string, open: string, close: string) {
  if (text.length < open.length + close.length) return false;
  if (!text.startsWith(open) || !text.endsWith(close)) return false;
  if (open === '*') return !text.startsWith('**') || text.startsWith('***');
  return true;
}

/** Toggles an inline format on every selection range. */
export function toggleInline(format: InlineFormat): Command {
  const [open, close] = INLINE[format];
  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const { from, to } = range;
      if (range.empty) {
        // An empty selection gets the marks with the cursor between them, or loses empty ones.
        if (
          state.sliceDoc(from - open.length, from) === open &&
          state.sliceDoc(to, to + close.length) === close
        )
          return {
            changes: [
              { from: from - open.length, to: from },
              { from: to, to: to + close.length },
            ],
            range: EditorSelection.cursor(from - open.length),
          };
        return {
          changes: { from, insert: open + close },
          range: EditorSelection.cursor(from + open.length),
        };
      }
      if (wrappedOutside(state, from, to, open, close))
        return {
          changes: [
            { from: from - open.length, to: from },
            { from: to, to: to + close.length },
          ],
          range: EditorSelection.range(from - open.length, to - open.length),
        };
      const text = state.sliceDoc(from, to);
      if (wrappedInside(text, open, close))
        return {
          changes: { from, to, insert: text.slice(open.length, text.length - close.length) },
          range: EditorSelection.range(from, to - open.length - close.length),
        };
      // Spaces at the edges stay outside the marks (`** bold**` is not bold in Markdown).
      const lead = text.length - text.trimStart().length;
      const trail = text.length - text.trimEnd().length;
      const start = from + lead;
      const end = to - trail;
      if (end <= start) return { range };
      return {
        changes: [
          { from: start, insert: open },
          { from: end, insert: close },
        ],
        range: EditorSelection.range(start + open.length, end + open.length),
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

/** Obsidian's highlight colours, written as an emoji straight after the opening `==`. */
export const HIGHLIGHT_COLOURS = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣',
} as const;
export type HighlightColour = keyof typeof HIGHLIGHT_COLOURS;
const COLOUR_EMOJI = /^(?:🔴|🟠|🟡|🟢|🔵|🟣)/u;

/** Highlights the selection (in a colour, or the default), or takes the highlight away (null). */
export function setHighlight(colour: HighlightColour | 'default' | null): Command {
  return ({ state, dispatch }) => {
    const emoji = colour && colour !== 'default' ? HIGHLIGHT_COLOURS[colour] : '';
    const changes = state.changeByRange((range) => {
      let { from, to } = range;
      // Inside a highlight already: find its marks (and any colour) around the selection.
      const line = state.doc.lineAt(from);
      const before = state.sliceDoc(line.from, from);
      const after = state.sliceDoc(to, line.to);
      const opening = before.lastIndexOf('==');
      const closing = after.indexOf('==');
      const inside =
        opening !== -1 &&
        closing !== -1 &&
        !before.slice(opening + 2).includes('==') &&
        !after.slice(0, closing).includes('==');
      if (inside) {
        const markFrom = line.from + opening;
        const rest = state.sliceDoc(markFrom + 2, from);
        const colourLength = COLOUR_EMOJI.exec(rest)?.[0].length ?? 0;
        const closeAt = to + closing;
        if (colour === null) {
          const removed = 2 + colourLength;
          return {
            changes: [
              { from: markFrom, to: markFrom + removed },
              { from: closeAt, to: closeAt + 2 },
            ],
            range: EditorSelection.range(from - removed, to - removed),
          };
        }
        const shift = emoji.length - colourLength;
        return {
          changes: { from: markFrom + 2, to: markFrom + 2 + colourLength, insert: emoji },
          range: EditorSelection.range(from + shift, to + shift),
        };
      }
      if (colour === null || range.empty) return { range };
      const text = state.sliceDoc(from, to);
      from += text.length - text.trimStart().length;
      to -= text.length - text.trimEnd().length;
      const open = `==${emoji}`;
      return {
        changes: [
          { from, insert: open },
          { from: to, insert: '==' },
        ],
        range: EditorSelection.range(from + open.length, to + open.length),
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

/** The marks "Clear formatting" removes; maths, comments and links keep theirs. */
const STRIP: [RegExp, string][] = [
  [/<u>([\s\S]*?)<\/u>/gu, '$1'],
  [/\*\*([\s\S]+?)\*\*/gu, '$1'],
  [/__([\s\S]+?)__/gu, '$1'],
  [/~~([\s\S]+?)~~/gu, '$1'],
  [/==(?:🔴|🟠|🟡|🟢|🔵|🟣)?([\s\S]+?)==/gu, '$1'],
  [/(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/gu, '$1'],
  [/(?<![\w_])_(?!\s)([^_\n]+?)_(?![\w_])/gu, '$1'],
  [/`([^`\n]+)`/gu, '$1'],
];
const AROUND: [string, string][] = [
  ['<u>', '</u>'],
  ['**', '**'],
  ['__', '__'],
  ['~~', '~~'],
  ['==', '=='],
  ['*', '*'],
  ['_', '_'],
  ['`', '`'],
];

export function stripFormatting(text: string): string {
  let result = text;
  for (const [pattern, replacement] of STRIP) result = result.replace(pattern, replacement);
  return result;
}

/** Takes the inline formats off the selection, including marks just around it. */
export const clearFormatting: Command = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    if (range.empty) return { range };
    let { from, to } = range;
    for (let grew = true; grew; ) {
      grew = false;
      for (const [open, close] of AROUND)
        if (
          state.sliceDoc(from - open.length, from) === open &&
          state.sliceDoc(to, to + close.length) === close
        ) {
          from -= open.length;
          to += close.length;
          grew = true;
        }
    }
    const text = state.sliceDoc(from, to);
    let clean = stripFormatting(text);
    for (const [open, close] of AROUND)
      if (
        clean.startsWith(open) &&
        clean.endsWith(close) &&
        clean.length >= open.length + close.length
      )
        clean = clean.slice(open.length, clean.length - close.length);
    clean = clean.replace(/^==(?:🔴|🟠|🟡|🟢|🔵|🟣)?/u, '');
    return {
      changes: { from, to, insert: clean },
      range: EditorSelection.range(from, from + clean.length),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};
