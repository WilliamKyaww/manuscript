import { create } from 'zustand';
import { readPreference, writePreference } from '../lib/storage';

/**
 * `expanded` or `collapsed`. A new key in 1.1 (task 23.01): the sidebar starts as a rail until the
 * student opens it, whatever an earlier version remembered.
 */
const SIDEBAR_KEY = 'skb.sidebar.state';
const WIDTH_KEY = 'skb.sidebar.width';
/** Below this width the sidebar is a rail of icons, so that the page keeps its room (task 20.22). */
export const NARROW_QUERY = '(max-width: 1023.98px)';
/** The open sidebar's width in pixels: 13.5 rem by default, dragged between 12 and 22 rem. */
export const SIDEBAR_WIDTH = { default: 216, min: 192, max: 352 } as const;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH.default;
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));
}

interface LayoutState {
  /** The remembered choice, for windows wide enough to have one. */
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Sets the width (clamped); `remember` once a drag ends. */
  setSidebarWidth(width: number, remember?: boolean): void;
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
  sidebarCollapsed: readPreference(SIDEBAR_KEY) !== 'expanded',
  sidebarWidth: clampSidebarWidth(Number(readPreference(WIDTH_KEY) ?? SIDEBAR_WIDTH.default)),
  setSidebarWidth(width, remember = true) {
    const clamped = clampSidebarWidth(width);
    if (remember) writePreference(WIDTH_KEY, String(clamped));
    set({ sidebarWidth: clamped });
  },
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
    writePreference(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
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
