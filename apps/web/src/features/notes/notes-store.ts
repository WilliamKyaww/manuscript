import { create } from 'zustand';
import { readPreference, writePreference } from '../../lib/storage';
import { SORT_ORDERS, type SortOrder } from './tree/buildTree';

/**
 * UI preferences for the notes page, remembered in this browser: which folders are open, whether
 * attachments show in the tree and in which order, the editor mode, live preview, the Details panel
 * (open or not, and its tab) and backlinks at the foot of the note.
 */

export type EditorMode = 'edit' | 'split' | 'preview';
export type SidePanel = 'outline' | 'backlinks' | 'outgoing' | 'properties' | 'graph';
export const SIDE_PANELS: readonly SidePanel[] = [
  'outline',
  'backlinks',
  'outgoing',
  'properties',
  'graph',
];

const KEYS = {
  expanded: 'skb.notes.expanded',
  attachments: 'skb.notes.showAttachments',
  mode: 'skb.notes.mode',
  panel: 'skb.notes.panel',
  livePreview: 'skb.notes.livePreview',
  sort: 'skb.notes.sort',
  details: 'skb.notes.details',
  backlinksInDocument: 'skb.notes.backlinksInDocument',
  strictLineBreaks: 'skb.notes.strictLineBreaks',
};

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = readPreference(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

interface NotesUiState {
  expanded: ReadonlySet<string>;
  showAttachments: boolean;
  mode: EditorMode;
  panel: SidePanel;
  livePreview: boolean;
  sort: SortOrder;
  /** Whether the Details panel is open (closed until the student opens it). */
  detailsOpen: boolean;
  backlinksInDocument: boolean;
  /**
   * Off (Obsidian's default): a single line break in a note is shown as a line break. On: only a
   * blank line starts a new paragraph, as in standard Markdown.
   */
  strictLineBreaks: boolean;
  /** A note just created, whose editor takes focus when it opens (not remembered). */
  justCreated: string | null;
  /** "Add file property" waits for the Properties panel to open its form (not remembered). */
  addPropertyPending: boolean;
  /** "Reveal file in navigation": the path to show and focus in the file tree, once. */
  revealRequest: { path: string; at: number } | null;
  toggleFolder(path: string): void;
  expandFolders(paths: readonly string[]): void;
  collapseAll(): void;
  setShowAttachments(show: boolean): void;
  setMode(mode: EditorMode): void;
  setPanel(panel: SidePanel): void;
  setLivePreview(on: boolean): void;
  setSort(sort: SortOrder): void;
  setDetailsOpen(open: boolean): void;
  /** Opens the Details panel on a tab. */
  showDetails(panel: SidePanel): void;
  setBacklinksInDocument(on: boolean): void;
  setStrictLineBreaks(on: boolean): void;
  setJustCreated(id: string | null): void;
  requestAddProperty(): void;
  addPropertyHandled(): void;
  /** Opens the folders above `path` and asks the tree to scroll to it and focus it. */
  reveal(path: string): void;
}

export const useNotesUi = create<NotesUiState>((set, get) => {
  const saveExpanded = (expanded: ReadonlySet<string>) => {
    writePreference(KEYS.expanded, JSON.stringify([...expanded]));
    set({ expanded });
  };
  return {
    expanded: new Set(readList(KEYS.expanded)),
    showAttachments: readPreference(KEYS.attachments) === 'true',
    mode: readEnum(KEYS.mode, ['edit', 'split', 'preview'], 'edit'),
    panel: readEnum(KEYS.panel, SIDE_PANELS, 'outline'),
    // On unless it has been turned off: the marks come back wherever the cursor is.
    livePreview: readPreference(KEYS.livePreview) !== 'false',
    toggleFolder(path) {
      const expanded = new Set(get().expanded);
      if (expanded.has(path)) expanded.delete(path);
      else expanded.add(path);
      saveExpanded(expanded);
    },
    expandFolders(paths) {
      const current = get().expanded;
      if (paths.every((path) => current.has(path))) return;
      saveExpanded(new Set([...current, ...paths]));
    },
    collapseAll() {
      saveExpanded(new Set());
    },
    setShowAttachments(show) {
      writePreference(KEYS.attachments, String(show));
      set({ showAttachments: show });
    },
    setMode(mode) {
      writePreference(KEYS.mode, mode);
      set({ mode });
    },
    setPanel(panel) {
      writePreference(KEYS.panel, panel);
      set({ panel });
    },
    setLivePreview(on) {
      writePreference(KEYS.livePreview, String(on));
      set({ livePreview: on });
    },
    sort: readEnum(
      KEYS.sort,
      SORT_ORDERS.map((order) => order.value),
      'name-asc',
    ),
    detailsOpen: readPreference(KEYS.details) === 'true',
    backlinksInDocument: readPreference(KEYS.backlinksInDocument) === 'true',
    setSort(sort) {
      writePreference(KEYS.sort, sort);
      set({ sort });
    },
    setDetailsOpen(open) {
      writePreference(KEYS.details, String(open));
      set({ detailsOpen: open });
    },
    showDetails(panel) {
      get().setPanel(panel);
      get().setDetailsOpen(true);
    },
    strictLineBreaks: readPreference(KEYS.strictLineBreaks) === 'true',
    setStrictLineBreaks(on) {
      writePreference(KEYS.strictLineBreaks, String(on));
      set({ strictLineBreaks: on });
    },
    setBacklinksInDocument(on) {
      writePreference(KEYS.backlinksInDocument, String(on));
      set({ backlinksInDocument: on });
    },
    justCreated: null,
    setJustCreated(id) {
      set({ justCreated: id });
    },
    addPropertyPending: false,
    addPropertyHandled() {
      set({ addPropertyPending: false });
    },
    revealRequest: null,
    reveal(path) {
      const ancestors: string[] = [];
      for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1))
        ancestors.push(path.slice(0, index));
      get().expandFolders(ancestors);
      set({ revealRequest: { path, at: (get().revealRequest?.at ?? 0) + 1 } });
    },
    requestAddProperty() {
      get().showDetails('properties');
      set({ addPropertyPending: true });
    },
  };
});
