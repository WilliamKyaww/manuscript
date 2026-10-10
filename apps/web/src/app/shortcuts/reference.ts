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
      { keys: ['mod+click'], description: 'Follow a link' },
      { keys: ['mod+f'], description: 'Find and replace in the note' },
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
      { keys: ['f2'], description: 'Rename' },
      { keys: ['delete'], description: 'Move to the bin' },
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
