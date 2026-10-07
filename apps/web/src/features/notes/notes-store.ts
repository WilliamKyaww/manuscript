import { create } from 'zustand';
import { readPreference, writePreference } from '../../lib/storage';

/**
 * UI preferences for the notes page, remembered in this browser: which folders are open, whether
 * attachments show in the tree, the editor mode and the side panel tab.
 */

export type EditorMode = 'edit' | 'split' | 'preview';
export type SidePanel = 'outline' | 'backlinks' | 'properties';

const KEYS = {
  expanded: 'skb.notes.expanded',
  attachments: 'skb.notes.showAttachments',
  mode: 'skb.notes.mode',
  panel: 'skb.notes.panel',
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
  toggleFolder(path: string): void;
  expandFolders(paths: readonly string[]): void;
  collapseAll(): void;
  setShowAttachments(show: boolean): void;
  setMode(mode: EditorMode): void;
  setPanel(panel: SidePanel): void;
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
    panel: readEnum(KEYS.panel, ['outline', 'backlinks', 'properties'], 'outline'),
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
  };
});
