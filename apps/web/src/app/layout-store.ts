import { create } from 'zustand';
import { readPreference, writePreference } from '../lib/storage';

const SIDEBAR_KEY = 'skb.sidebar.collapsed';

interface LayoutState {
  sidebarCollapsed: boolean;
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
  toggleSidebar() {
    get().setSidebarCollapsed(!get().sidebarCollapsed);
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
