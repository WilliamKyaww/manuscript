import type { CardKind, Locator } from '@skb/core';
import { create } from 'zustand';

/**
 * The quick-add card dialogue (task 8.08), opened from anywhere: the `Ctrl+Shift+A` shortcut, the
 * command palette, or "Make card from selection" in a note or a source, which fill in a draft.
 */

export interface CardDraft {
  setId?: string;
  kind?: CardKind;
  front?: string;
  back?: string;
  extra?: string;
  locator?: Locator;
  conceptIds?: string[];
}

interface QuickAddState {
  draft: CardDraft | null;
  open(draft?: CardDraft): void;
  close(): void;
}

export const useQuickAdd = create<QuickAddState>((set) => ({
  draft: null,
  open: (draft = {}) => set({ draft }),
  close: () => set({ draft: null }),
}));
