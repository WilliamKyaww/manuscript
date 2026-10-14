import { z } from 'zod';
import { create } from 'zustand';
import { readPreference, writePreference } from '../../../lib/storage';

/**
 * Tabs and panes of the Notes section (task 23.04, ADR-0042): one pane or two (side by side or one
 * above the other), each with its tabs, remembered in this browser. A tab shows one note, a web page
 * (Phase 26, in the desktop app), or nothing ("New tab"). The address always shows the active tab's
 * note, so the rest of the application opens notes by navigating, as before; `show` puts the note in
 * the active tab. A web page opens on the right of the source note, reusing the other pane's tabs,
 * and the note's pane stays the active one, so the address keeps showing the note.
 */

export type SplitDirection = 'right' | 'down';

export interface WorkspaceTab {
  id: string;
  noteId: string | null;
  /** A web page (http or https); such a tab has no note. */
  url?: string | null;
}

export interface WorkspacePane {
  id: string;
  tabs: WorkspaceTab[];
  activeTab: string;
}

export interface WorkspaceLayout {
  panes: WorkspacePane[];
  direction: SplitDirection;
  activePane: string;
}

export interface WorkspaceState extends WorkspaceLayout {
  /** Shows a note in the active pane: its tab if it has one there, otherwise in the active tab. */
  show(noteId: string | null): void;
  /** A new tab after the active one, made active unless `background`. */
  openInNewTab(noteId: string | null, options?: { background?: boolean }): void;
  /** Opens a note in the other pane, making one (in `direction`) if there is only one. */
  openInOtherPane(noteId: string, direction: SplitDirection): void;
  /**
   * Opens a web page on the right of `fromPane` (the active pane by default), reusing the other pane
   * or creating one. A tab already showing the address is shown again; existing note tabs are kept.
   */
  openWebPage(url: string, fromPane?: string): void;
  /** Remembers where a web tab's page went, so that it opens there again. */
  setTabUrl(tabId: string, url: string): void;
  activateTab(paneId: string, tabId: string): void;
  focusPane(paneId: string): void;
  closeTab(paneId: string, tabId: string): void;
  closeOtherTabs(paneId: string, tabId: string): void;
  /** Moves a tab within its pane (drag and drop, or the keyboard). */
  moveTab(paneId: string, tabId: string, toIndex: number): void;
  /** Tabs showing a note that is gone show nothing; a merged note's tabs show what it became. */
  replaceNote(noteId: string, replacement: string | null): void;
  /** Drops tabs whose note is not in `existing` (notes of another vault, or deleted). */
  prune(existing: ReadonlySet<string>): void;
  /** Closes every tab showing one of these notes (they were moved to the trash). */
  closeNotes(noteIds: ReadonlySet<string>): void;
}

const KEY = 'skb.notes.workspace';
const MAX_TABS = 30;

const LayoutSchema = z.object({
  panes: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        tabs: z
          .array(
            z.object({
              id: z.string().min(1).max(40),
              noteId: z.string().max(80).nullable(),
              url: z.string().max(8192).nullable().optional(),
            }),
          )
          .min(1)
          .max(MAX_TABS),
        activeTab: z.string(),
      }),
    )
    .min(1)
    .max(2),
  direction: z.enum(['right', 'down']),
  activePane: z.string(),
});

let counter = 0;
const nextId = (prefix: string) => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
};

export function emptyLayout(): WorkspaceLayout {
  const tab = { id: nextId('t'), noteId: null };
  const pane = { id: nextId('p'), tabs: [tab], activeTab: tab.id };
  return { panes: [pane], direction: 'right', activePane: pane.id };
}

/** A remembered layout, repaired where it is inconsistent; a fresh one if it is unreadable. */
export function readLayout(raw: string | null): WorkspaceLayout {
  if (!raw) return emptyLayout();
  try {
    const parsed = LayoutSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyLayout();
    const panes = parsed.data.panes.map((pane) => ({
      ...pane,
      // Only a tab without a note keeps an address, and only a web one.
      tabs: pane.tabs.map((tab) =>
        tab.url && tab.noteId === null && /^https?:\/\//iu.test(tab.url)
          ? { id: tab.id, noteId: null, url: tab.url }
          : { id: tab.id, noteId: tab.noteId },
      ),
      activeTab: pane.tabs.some((tab) => tab.id === pane.activeTab)
        ? pane.activeTab
        : (pane.tabs[0]?.id ?? ''),
    }));
    const activePane = panes.some((pane) => pane.id === parsed.data.activePane)
      ? parsed.data.activePane
      : (panes[0]?.id ?? '');
    const [first, second] = panes;
    // Phase 26 remembered the browser on the left. Repair that unambiguous layout without moving
    // mixed tabs or the student's two-note splits, and retain every tab, pane id and focus choice.
    if (
      first?.tabs.every((tab) => Boolean(tab.url)) &&
      second?.tabs.every((tab) => !tab.url) &&
      second.tabs.some((tab) => tab.noteId !== null)
    )
      return { panes: [second, first], direction: 'right', activePane };
    return { panes, direction: parsed.data.direction, activePane };
  } catch {
    return emptyLayout();
  }
}

export const activePaneOf = (layout: WorkspaceLayout): WorkspacePane =>
  layout.panes.find((pane) => pane.id === layout.activePane) ?? (layout.panes[0] as WorkspacePane);

export const activeTabOf = (pane: WorkspacePane): WorkspaceTab =>
  pane.tabs.find((tab) => tab.id === pane.activeTab) ?? (pane.tabs[0] as WorkspaceTab);

/** The note in the active tab of the active pane. */
export const selectActiveNoteId = (layout: WorkspaceLayout): string | null =>
  activeTabOf(activePaneOf(layout)).noteId;

type Layout = WorkspaceLayout;

function updatePane(
  layout: Layout,
  paneId: string,
  change: (pane: WorkspacePane) => WorkspacePane,
) {
  return {
    ...layout,
    panes: layout.panes.map((pane) => (pane.id === paneId ? change(pane) : pane)),
  };
}

function withTab(
  pane: WorkspacePane,
  noteId: string | null,
  afterActive = true,
  url: string | null = null,
): WorkspacePane {
  const tab: WorkspaceTab = url
    ? { id: nextId('t'), noteId: null, url }
    : { id: nextId('t'), noteId };
  const index = pane.tabs.findIndex((entry) => entry.id === pane.activeTab);
  const tabs = [...pane.tabs];
  tabs.splice(afterActive && index !== -1 ? index + 1 : tabs.length, 0, tab);
  // The oldest tabs go first when there are too many.
  while (tabs.length > MAX_TABS) tabs.splice(tabs[0]?.id === pane.activeTab ? 1 : 0, 1);
  return { ...pane, tabs, activeTab: tab.id };
}

export function closeTabIn(layout: Layout, paneId: string, tabId: string): Layout {
  const pane = layout.panes.find((entry) => entry.id === paneId);
  if (!pane) return layout;
  const index = pane.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return layout;
  const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
  if (tabs.length === 0) {
    // The last tab of the second pane closes the pane; the last of all leaves an empty tab.
    if (layout.panes.length > 1) {
      const panes = layout.panes.filter((entry) => entry.id !== paneId);
      return { ...layout, panes, activePane: panes[0]?.id ?? layout.activePane };
    }
    const tab = { id: nextId('t'), noteId: null };
    return updatePane(layout, paneId, () => ({ ...pane, tabs: [tab], activeTab: tab.id }));
  }
  const activeTab =
    pane.activeTab === tabId
      ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]?.id ?? '')
      : pane.activeTab;
  return updatePane(layout, paneId, () => ({ ...pane, tabs, activeTab }));
}

export function createWorkspaceStore({ persist }: { persist: boolean }) {
  return create<WorkspaceState>((set, get) => {
    const commit = (next: Layout) => {
      const layout = { panes: next.panes, direction: next.direction, activePane: next.activePane };
      if (persist) writePreference(KEY, JSON.stringify(layout));
      set(layout);
    };
    const layout = (): Layout => get();
    const initial = persist ? readLayout(readPreference(KEY)) : emptyLayout();
    return {
      ...initial,

      show(noteId) {
        const current = layout();
        const pane = activePaneOf(current);
        const tab = activeTabOf(pane);
        if (tab.noteId === noteId && !tab.url) return;
        const existing =
          noteId === null ? undefined : pane.tabs.find((entry) => entry.noteId === noteId);
        // A web page is not replaced by a note: the note gets a tab of its own beside it.
        if (!existing && tab.url) {
          commit(updatePane(current, pane.id, (entry) => withTab(entry, noteId)));
          return;
        }
        commit(
          updatePane(current, pane.id, (entry) =>
            existing
              ? { ...entry, activeTab: existing.id }
              : {
                  ...entry,
                  tabs: entry.tabs.map((tab) =>
                    tab.id === entry.activeTab ? { ...tab, noteId } : tab,
                  ),
                },
          ),
        );
      },

      openInNewTab(noteId, options) {
        const current = layout();
        const pane = activePaneOf(current);
        const next = withTab(pane, noteId);
        commit(
          updatePane(current, pane.id, () =>
            options?.background ? { ...next, activeTab: pane.activeTab } : next,
          ),
        );
      },

      openInOtherPane(noteId, direction) {
        const current = layout();
        const pane = activePaneOf(current);
        const other = current.panes.find((entry) => entry.id !== pane.id);
        if (other) {
          const existing = other.tabs.find((tab) => tab.noteId === noteId);
          const updated = existing ? { ...other, activeTab: existing.id } : withTab(other, noteId);
          commit({ ...updatePane(current, other.id, () => updated), activePane: other.id });
          return;
        }
        const tab = { id: nextId('t'), noteId };
        const created = { id: nextId('p'), tabs: [tab], activeTab: tab.id };
        commit({ panes: [pane, created], direction, activePane: created.id });
      },

      openWebPage(url, fromPane) {
        const current = layout();
        const from =
          current.panes.find((pane) => pane.id === (fromPane ?? current.activePane)) ??
          activePaneOf(current);
        const other = current.panes.find((pane) => pane.id !== from.id);
        if (other) {
          const existing = other.tabs.find((tab) => tab.url === url);
          const updated = existing
            ? { ...other, activeTab: existing.id }
            : withTab(other, null, true, url);
          commit({ panes: [from, updated], direction: 'right', activePane: from.id });
          return;
        }
        const tab: WorkspaceTab = { id: nextId('t'), noteId: null, url };
        const created = { id: nextId('p'), tabs: [tab], activeTab: tab.id };
        commit({ panes: [from, created], direction: 'right', activePane: from.id });
      },

      setTabUrl(tabId, url) {
        const current = layout();
        if (
          !current.panes.some((pane) =>
            pane.tabs.some((tab) => tab.id === tabId && tab.url && tab.url !== url),
          )
        )
          return;
        commit({
          ...current,
          panes: current.panes.map((pane) => ({
            ...pane,
            tabs: pane.tabs.map((tab) => (tab.id === tabId && tab.url ? { ...tab, url } : tab)),
          })),
        });
      },

      activateTab(paneId, tabId) {
        const current = layout();
        commit({
          ...updatePane(current, paneId, (pane) => ({ ...pane, activeTab: tabId })),
          activePane: paneId,
        });
      },

      focusPane(paneId) {
        const current = layout();
        if (current.activePane !== paneId && current.panes.some((pane) => pane.id === paneId))
          commit({ ...current, activePane: paneId });
      },

      closeTab(paneId, tabId) {
        commit(closeTabIn(layout(), paneId, tabId));
      },

      closeOtherTabs(paneId, tabId) {
        commit(
          updatePane(layout(), paneId, (pane) => ({
            ...pane,
            tabs: pane.tabs.filter((tab) => tab.id === tabId),
            activeTab: tabId,
          })),
        );
      },

      moveTab(paneId, tabId, toIndex) {
        commit(
          updatePane(layout(), paneId, (pane) => {
            const from = pane.tabs.findIndex((tab) => tab.id === tabId);
            if (from === -1) return pane;
            const tabs = [...pane.tabs];
            const [moved] = tabs.splice(from, 1);
            if (moved) tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, moved);
            return { ...pane, tabs };
          }),
        );
      },

      replaceNote(noteId, replacement) {
        const current = layout();
        if (!current.panes.some((pane) => pane.tabs.some((tab) => tab.noteId === noteId))) return;
        commit({
          ...current,
          panes: current.panes.map((pane) => ({
            ...pane,
            tabs: pane.tabs.map((tab) =>
              tab.noteId === noteId ? { ...tab, noteId: replacement } : tab,
            ),
          })),
        });
      },

      closeNotes(noteIds) {
        let next = layout();
        for (const pane of next.panes)
          for (const tab of pane.tabs)
            if (tab.noteId !== null && noteIds.has(tab.noteId))
              next = closeTabIn(next, pane.id, tab.id);
        if (next !== layout()) commit(next);
      },

      prune(existing) {
        let next = layout();
        for (const pane of next.panes)
          for (const tab of pane.tabs)
            if (tab.noteId !== null && !existing.has(tab.noteId))
              next = closeTabIn(next, pane.id, tab.id);
        if (next !== layout()) commit(next);
      },
    };
  });
}

/**
 * A pop-out window (`?window=note`, "Open in new window") shows one note and must not change the
 * main window's tabs, so its workspace is not remembered. Decided once, when the page loads: the
 * address loses the parameter as soon as the window navigates.
 */
export const POPOUT_WINDOW =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('window') === 'note';

export const useWorkspace = createWorkspaceStore({ persist: !POPOUT_WINDOW });
