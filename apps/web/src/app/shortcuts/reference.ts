import { REVIEW_KEYS } from '../../features/review/session/keys';

/**
 * Keys that work on one page or in one control (task 20.20). The global shortcuts live in the
 * registry; these are handled where they apply — the editor, the notes list, a form — so the cheat
 * sheet lists them from here, always, wherever it is opened. Written like the registry (`mod+s`).
 */

export interface ReferenceShortcut {
  /** Alternatives, shown with "or" between them. */
  keys: string[];
  description: string;
}

export interface ReferenceSection {
  title: string;
  items: ReferenceShortcut[];
}

/** One row per description: keys that do the same thing are alternatives. */
function merge(items: { keys: string; description: string }[]): ReferenceShortcut[] {
  const rows = new Map<string, ReferenceShortcut>();
  for (const item of items) {
    const row = rows.get(item.description) ?? { keys: [], description: item.description };
    row.keys.push(item.keys);
    rows.set(item.description, row);
  }
  return [...rows.values()];
}

export const PAGE_SHORTCUTS: readonly ReferenceSection[] = [
  {
    title: 'Note editor',
    items: [
      { keys: ['mod+s'], description: 'Save now (notes also save as you type)' },
      { keys: ['[['], description: 'Link to a note or concept, with suggestions' },
      { keys: ['#'], description: 'Tag, with suggestions' },
      { keys: ['mod+click'], description: 'Follow a link (a web link: in the browser)' },
      { keys: ['mod+b'], description: 'Bold' },
      { keys: ['mod+i'], description: 'Italic' },
      { keys: ['mod+u'], description: 'Underline' },
      { keys: ['mod+shift+s'], description: 'Strikethrough' },
      { keys: ['mod+shift+h'], description: 'Highlight' },
      { keys: ['mod+`'], description: 'Inline code' },
      { keys: ['mod+shift+e'], description: 'Inline maths' },
      { keys: ['mod+shift+m'], description: 'Comment (hidden in the reading view)' },
      { keys: ['mod+shift+k'], description: 'Link the selection to a web address' },
      { keys: ['mod+shift+v'], description: 'Paste as plain text' },
      { keys: ['alt+f10'], description: 'Move into the toolbar over a selection' },
      { keys: ['shift+f10'], description: 'The editor’s menu (format, paragraph, insert, AI)' },
      { keys: ['mod+f'], description: 'Find in the note' },
      { keys: ['mod+h'], description: 'Replace in the note' },
      { keys: ['mod+z'], description: 'Undo' },
      { keys: ['mod+y', 'mod+shift+z'], description: 'Redo' },
      { keys: ['escape'], description: 'Leave the editor (Esc, then Tab)' },
    ],
  },
  {
    title: 'Notes list',
    items: [
      { keys: ['arrowup', 'arrowdown'], description: 'Move between notes and folders' },
      { keys: ['arrowright', 'arrowleft'], description: 'Open or close a folder' },
      { keys: ['enter'], description: 'Open' },
      { keys: ['mod+click'], description: 'Open in a new tab (a middle click too)' },
      { keys: ['f2'], description: 'Rename' },
      { keys: ['delete'], description: 'Move to the trash' },
      { keys: ['shift+f10'], description: 'More actions (the context menu)' },
    ],
  },
  { title: 'Review session', items: merge(Object.values(REVIEW_KEYS)) },
  {
    title: 'Practice',
    items: [
      { keys: ['enter'], description: 'Check the answer' },
      { keys: ['mod+enter'], description: 'Check a written answer' },
    ],
  },
  {
    title: 'Chat',
    items: [
      { keys: ['enter'], description: 'Send' },
      { keys: ['shift+enter'], description: 'New line' },
      { keys: ['@'], description: 'Mention a note, source or concept' },
      { keys: ['escape'], description: 'Close the chat panel' },
    ],
  },
  {
    title: 'Open a note by name',
    items: [
      { keys: ['enter'], description: 'Open the note' },
      { keys: ['shift+enter'], description: 'Create a note with that name' },
    ],
  },
  {
    title: 'Dialogues and menus',
    items: [{ keys: ['escape'], description: 'Close' }],
  },
];
