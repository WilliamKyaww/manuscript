import { EditorSelection, type EditorState } from '@codemirror/state';
import type { Command } from './format';

/**
 * Links and insertions (Phase 26): `[[selection]]`, `[selection](address)`, footnotes, tables,
 * callouts, rules and code or maths blocks — Obsidian's "Add link", "Add external link" and Insert
 * menu.
 */

/** `[[selection]]`, or `[[]]` with the cursor inside when nothing is selected. */
export const wrapWikilink: Command = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const text = state
      .sliceDoc(range.from, range.to)
      .replace(/[[\]|#^]/gu, '')
      .trim();
    const insert = `[[${text}]]`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: text
        ? EditorSelection.cursor(range.from + insert.length)
        : EditorSelection.cursor(range.from + 2),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

const LOOKS_LIKE_URL = /^(?:https?:\/\/|www\.)\S+$/iu;

/**
 * `[selection](address)`: with an address, the link is made; without one, the cursor waits between
 * the brackets for it (or, when the selection is itself an address, for the link's words).
 */
export function wrapMarkdownLink(address?: string): Command {
  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      if (!address && LOOKS_LIKE_URL.test(text.trim())) {
        const insert = `[](${text.trim()})`;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.cursor(range.from + 1),
        };
      }
      const insert = `[${text}](${address ?? ''})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: address
          ? EditorSelection.cursor(range.from + insert.length)
          : EditorSelection.cursor(range.from + text.length + 3),
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

export type Snippet = 'footnote' | 'table' | 'callout' | 'rule' | 'codeBlock' | 'mathsBlock';

/** Inserts a block on lines of its own after the cursor's line (or on it, when it is empty). */
function insertBlock(state: EditorState, text: string, cursorOffset: number) {
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = line.text.trim() === '';
  const from = empty ? line.from : line.to;
  const insert = empty ? text : `\n${text}`;
  return {
    changes: { from, to: empty ? line.to : from, insert },
    selection: EditorSelection.cursor(from + (empty ? 0 : 1) + cursorOffset),
  };
}

export function insertSnippet(snippet: Snippet): Command {
  return ({ state, dispatch }) => {
    if (snippet === 'footnote') {
      // The next free number: a reference at the cursor, its definition at the end of the note.
      const used = new Set(
        [...state.doc.toString().matchAll(/\[\^(\d+)\]/gu)].map((match) => Number(match[1])),
      );
      let n = 1;
      while (used.has(n)) n += 1;
      const at = state.selection.main.to;
      const end = state.doc.length;
      const definition = `${state.doc.sliceString(end - 1, end) === '\n' ? '' : '\n'}\n[^${n}]: `;
      dispatch(
        state.update({
          changes: [
            { from: at, insert: `[^${n}]` },
            { from: end, insert: definition },
          ],
          selection: EditorSelection.cursor(end + `[^${n}]`.length + definition.length),
          scrollIntoView: true,
          userEvent: 'input.format',
        }),
      );
      return true;
    }
    const blocks: Record<Exclude<Snippet, 'footnote'>, [string, number]> = {
      table: ['| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n', 2],
      callout: ['> [!note] Title\n> ', 18],
      rule: ['---\n', 4],
      codeBlock: ['```\n\n```\n', 4],
      mathsBlock: ['$$\n\n$$\n', 3],
    };
    const [text, offset] = blocks[snippet];
    dispatch(
      state.update({
        ...insertBlock(state, text, offset),
        scrollIntoView: true,
        userEvent: 'input.format',
      }),
    );
    return true;
  };
}
