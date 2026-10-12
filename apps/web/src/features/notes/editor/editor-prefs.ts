import { create } from 'zustand';
import { readPreference, writePreference } from '../../../lib/storage';

/**
 * How the editor behaves around links and selections (Phase 26), remembered in this browser: each is
 * on unless it has been turned off in Settings → Editor.
 */

const KEYS = {
  openLinksBeside: 'skb.editor.openLinksBeside',
  selectionToolbar: 'skb.editor.selectionToolbar',
  convertPastedHtml: 'skb.editor.convertPastedHtml',
} as const;

type Preference = keyof typeof KEYS;

interface EditorPrefs {
  /** A web link opens in a pane beside the note (desktop app); off, in the system browser. */
  openLinksBeside: boolean;
  /** A toolbar of formatting, links and AI over selected text. */
  selectionToolbar: boolean;
  /** Text pasted from a web page or a document keeps its headings, lists, links and tables. */
  convertPastedHtml: boolean;
  set(preference: Preference, on: boolean): void;
}

const on = (key: string) => readPreference(key) !== 'false';

export const useEditorPrefs = create<EditorPrefs>((set) => ({
  openLinksBeside: on(KEYS.openLinksBeside),
  selectionToolbar: on(KEYS.selectionToolbar),
  convertPastedHtml: on(KEYS.convertPastedHtml),
  set(preference, value) {
    writePreference(KEYS[preference], String(value));
    set({ [preference]: value } as Pick<EditorPrefs, Preference>);
  },
}));
