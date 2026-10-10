import { create } from 'zustand';
import { readPreference, writePreference } from '../lib/storage';

const SIDEBAR_KEY = 'skb.sidebar.collapsed';
/** Below this width the sidebar is a rail of icons, so that the page keeps its room (task 20.22). */
export const NARROW_QUERY = '(max-width: 1023.98px)';

interface LayoutState {
  /** The remembered choice, for windows wide enough to have one. */
  sidebarCollapsed: boolean;
  /** A narrow window, and whether the rail has been opened in it (for now: never remembered). */
  narrow: boolean;
  narrowExpanded: boolean;
  setNarrow(narrow: boolean): void;
  toggleSidebar(): void;
  setSidebarCollapsed(collapsed: boolean): void;
  /** Overlays (dialogs) that more than one component can open. */
  commandPaletteOpen: boolean;
  setCommandPaletteOpen(open: boolean): void;
  shortcutsOpen: boolean;
  setShortcutsOpen(open: boolean): void;
  quickSwitcherOpen: boolean;
  setQuickSwitcherOpen(open: boolean): void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarCollapsed: readPreference(SIDEBAR_KEY) === 'true',
  narrow: false,
  narrowExpanded: false,
  setNarrow(narrow) {
    if (narrow !== get().narrow) set({ narrow, narrowExpanded: false });
  },
  toggleSidebar() {
    if (get().narrow) set({ narrowExpanded: !get().narrowExpanded });
    else get().setSidebarCollapsed(!get().sidebarCollapsed);
  },
  setSidebarCollapsed(collapsed) {
    writePreference(SIDEBAR_KEY, String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },
  commandPaletteOpen: false,
  setCommandPaletteOpen(open) {
    set({
      commandPaletteOpen: open,
      ...(open ? { shortcutsOpen: false, quickSwitcherOpen: false } : {}),
    });
  },
  shortcutsOpen: false,
  setShortcutsOpen(open) {
    set({
      shortcutsOpen: open,
      ...(open ? { commandPaletteOpen: false, quickSwitcherOpen: false } : {}),
    });
  },
  quickSwitcherOpen: false,
  setQuickSwitcherOpen(open) {
    set({
      quickSwitcherOpen: open,
      ...(open ? { commandPaletteOpen: false, shortcutsOpen: false } : {}),
    });
  },
}));

/** Whether the sidebar shows as a rail now: always in a narrow window, unless opened there. */
export const selectSidebarCollapsed = (state: LayoutState): boolean =>
  state.narrow ? !state.narrowExpanded : state.sidebarCollapsed;
