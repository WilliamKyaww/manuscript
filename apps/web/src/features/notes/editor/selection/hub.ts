import type { EditorView } from '@codemirror/view';
import { useSyncExternalStore } from 'react';

/**
 * One editor's view and its changes, for the parts of the page that float over it (Phase 26): the
 * selection toolbar, the right-click menu and the AI suggestion. The editor tells the hub about every
 * change of selection, focus or layout; each part reads what it needs when told.
 */

export interface EditorHub {
  view: EditorView | null;
  /** Bumped on every change worth redrawing for. */
  version: number;
  /** A box of the toolbar asked for from elsewhere (the right-click menu's "Edit with AI…"). */
  wanted: 'ai' | 'link' | null;
  subscribe(listener: () => void): () => void;
  notify(): void;
}

export function createHub(): EditorHub {
  const listeners = new Set<() => void>();
  const hub: EditorHub = {
    view: null,
    version: 0,
    wanted: null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      hub.version += 1;
      for (const listener of listeners) listener();
    },
  };
  return hub;
}

/** Redraws the caller on every change the hub reports. */
export function useHubVersion(hub: EditorHub): number {
  return useSyncExternalStore(hub.subscribe, () => hub.version);
}

/** Where a floating panel goes for [from, to): above the start of the selection, or below its end. */
export function placeOver(
  view: EditorView,
  from: number,
  to: number,
  size: { width: number; height: number },
): { left: number; top: number } | null {
  const start = view.coordsAtPos(from, 1);
  const end = view.coordsAtPos(to, -1);
  if (!start || !end) return null;
  const scroller = view.scrollDOM.getBoundingClientRect();
  // Off screen (scrolled away): nothing to point at.
  if (end.bottom < scroller.top || start.top > scroller.bottom) return null;
  const margin = 8;
  const sameLine = Math.abs(start.top - end.top) < 4;
  const centre = sameLine ? (start.left + end.right) / 2 : start.left + size.width / 2;
  let left = centre - size.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - size.width - margin));
  let top = start.top - size.height - margin;
  if (top < Math.max(margin, scroller.top - 4)) top = end.bottom + margin;
  top = Math.min(top, window.innerHeight - size.height - margin);
  return { left, top };
}
