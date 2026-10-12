import { useEffect } from 'react';
import { create } from 'zustand';
import { readPreference, writePreference } from '../../lib/storage';

/**
 * Appearance beyond light and dark (Phase 24, ADR-0043): the colour palette and Simplified UI. Both are
 * attributes on the document (`data-palette`, `data-ui`) that the tokens and the `simplified:` variant
 * read; `public/theme-init.js` sets them before the first paint from the same keys.
 */

export type PaletteId = 'manuscript' | 'graphite' | 'sand' | 'slate' | 'sage' | 'iris';

export interface PaletteOption {
  id: PaletteId;
  name: string;
  description: string;
  /** For the preview in Settings: page, sidebar, text and accent in each theme. */
  preview: Record<'light' | 'dark', { bg: string; chrome: string; text: string; accent: string }>;
}

/** Keep the ids in sync with tokens.css and public/theme-init.js. */
export const PALETTES: readonly PaletteOption[] = [
  {
    id: 'manuscript',
    name: 'Manuscript',
    description: 'Warm paper and forest green: the original.',
    preview: {
      light: { bg: '#f7f5f1', chrome: '#ffffff', text: '#1f1c18', accent: '#2f6b5a' },
      dark: { bg: '#121211', chrome: '#1a1918', text: '#ece8e1', accent: '#6bbfa6' },
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'True neutral greys with an ink-blue accent.',
    preview: {
      light: { bg: '#f5f5f4', chrome: '#ffffff', text: '#1c1c1e', accent: '#3b5b86' },
      dark: { bg: '#1c1c1c', chrome: '#232323', text: '#e6e6e4', accent: '#9bb3d6' },
    },
  },
  {
    id: 'sand',
    name: 'Sand',
    description: 'Warmer, softer paper with a terracotta accent.',
    preview: {
      light: { bg: '#f8f1e7', chrome: '#fffcf7', text: '#2a2118', accent: '#9e4a27' },
      dark: { bg: '#16120e', chrome: '#1e1914', text: '#f0e6da', accent: '#e8a27c' },
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool blue-grey surfaces with a steel-blue accent.',
    preview: {
      light: { bg: '#f3f5f8', chrome: '#ffffff', text: '#17202b', accent: '#2c5d97' },
      dark: { bg: '#0f1318', chrome: '#161b22', text: '#e3e8ef', accent: '#80b1ec' },
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Green-tinted neutrals with a muted sage accent.',
    preview: {
      light: { bg: '#f2f5f0', chrome: '#fcfdfb', text: '#1a2019', accent: '#41704a' },
      dark: { bg: '#111511', chrome: '#181d18', text: '#e4ebe2', accent: '#90c597' },
    },
  },
  {
    id: 'iris',
    name: 'Iris',
    description: 'Violet-tinted neutrals with a muted iris accent.',
    preview: {
      light: { bg: '#f6f5f9', chrome: '#ffffff', text: '#1e1b26', accent: '#674caf' },
      dark: { bg: '#16141b', chrome: '#1d1a23', text: '#ebe7f1', accent: '#b39ef0' },
    },
  },
];

export const PALETTE_STORAGE_KEY = 'skb.palette';
export const UI_STORAGE_KEY = 'skb.ui';

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

export function applyAppearance(palette: PaletteId, simplified: boolean): void {
  document.documentElement.dataset.palette = palette;
  document.documentElement.dataset.ui = simplified ? 'simplified' : 'standard';
}

interface AppearanceState {
  palette: PaletteId;
  /** Simplified UI: on unless the student has turned it off. */
  simplified: boolean;
  setPalette(palette: PaletteId): void;
  setSimplified(on: boolean): void;
}

export const useAppearance = create<AppearanceState>((set, get) => {
  const stored = readPreference(PALETTE_STORAGE_KEY);
  return {
    palette: isPaletteId(stored) ? stored : 'manuscript',
    simplified: readPreference(UI_STORAGE_KEY) !== 'standard',
    setPalette(palette) {
      writePreference(PALETTE_STORAGE_KEY, palette);
      applyAppearance(palette, get().simplified);
      set({ palette });
    },
    setSimplified(on) {
      writePreference(UI_STORAGE_KEY, on ? 'simplified' : 'standard');
      applyAppearance(get().palette, on);
      set({ simplified: on });
    },
  };
});

/** Keeps the document's attributes in step with the store (and sets them if the boot script did not). */
export function useAppearanceSync(): void {
  const palette = useAppearance((state) => state.palette);
  const simplified = useAppearance((state) => state.simplified);
  useEffect(() => applyAppearance(palette, simplified), [palette, simplified]);
}
