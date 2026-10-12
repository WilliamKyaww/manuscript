import type { Extension } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { type Command, type InlineFormat, setHighlight, toggleInline } from '../format';
import { wrapMarkdownLink } from '../format-insert';

/**
 * The formatting shortcuts (Phase 26): Obsidian's Ctrl+B and Ctrl+I, and Notion's for the rest —
 * Ctrl+U underline, Ctrl+Shift+S strikethrough, Ctrl+Shift+H highlight, Ctrl+` code, Ctrl+Shift+E
 * maths, Ctrl+Shift+M comment, Ctrl+Shift+K a link (Ctrl+K is the command palette's, Ctrl+E the
 * reading view's). ⌘ on a Mac.
 */

const editable = (command: Command) => (view: EditorView) =>
  !view.state.readOnly && command({ state: view.state, dispatch: (tr) => view.dispatch(tr) });

const inline = (key: string, format: InlineFormat) => ({
  key,
  preventDefault: true,
  run: editable(toggleInline(format)),
});

export const formattingKeymap: Extension = keymap.of([
  inline('Mod-b', 'bold'),
  inline('Mod-i', 'italic'),
  inline('Mod-u', 'underline'),
  inline('Mod-Shift-s', 'strikethrough'),
  { key: 'Mod-Shift-h', preventDefault: true, run: editable(setHighlight('default')) },
  inline('Mod-`', 'code'),
  inline('Mod-Shift-e', 'maths'),
  inline('Mod-Shift-m', 'comment'),
  { key: 'Mod-Shift-k', preventDefault: true, run: editable(wrapMarkdownLink()) },
]);
