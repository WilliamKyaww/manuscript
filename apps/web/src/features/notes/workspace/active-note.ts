import type { NoteDetail } from '@skb/core';
import type { HeadingRef } from '@skb/core/markdown';
import { create } from 'zustand';

/**
 * The note in the active pane, as the panes around it need it (task 23.05): the Details panel shows
 * its outline and properties from the text being typed, and the menus act on its editor. The view of
 * the active pane publishes itself here; other views stay quiet.
 */

export interface ActiveNoteView {
  /** The pane and note, so that a view only ever clears what it published. */
  owner: string;
  note: NoteDetail;
  /** The text as typed (a moment behind the editor). */
  text: string;
  headings: readonly HeadingRef[];
  readOnly: boolean;
  goToHeading(heading: HeadingRef): void;
  /** Replaces the text in the editor (properties edited in the Details panel). */
  setText(text: string): void;
  /** Saves now, if there is anything unsaved. */
  flush(): Promise<void>;
}

interface ActiveNoteState {
  view: ActiveNoteView | null;
  publish(view: ActiveNoteView): void;
  clear(owner: string): void;
}

export const useActiveNote = create<ActiveNoteState>((set, get) => ({
  view: null,
  publish(view) {
    set({ view });
  },
  clear(owner) {
    if (get().view?.owner === owner) set({ view: null });
  },
}));
