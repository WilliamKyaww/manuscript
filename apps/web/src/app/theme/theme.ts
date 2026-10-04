import { useEffect } from 'react';
import { create } from 'zustand';
import { readPreference, writePreference } from '../../lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Keep in sync with public/theme-init.js, which applies the theme before React loads. */
export const THEME_STORAGE_KEY = 'skb.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches
    ? 'dark'
    : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
  /** Re-evaluates the system theme (called when the OS setting changes). */
  refresh(): void;
}

function initialPreference(): ThemePreference {
  const stored = readPreference(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const preference = initialPreference();
  return {
    preference,
    resolved: resolveTheme(preference),
    setPreference(next) {
      writePreference(THEME_STORAGE_KEY, next);
      const resolved = resolveTheme(next);
      applyTheme(resolved);
      set({ preference: next, resolved });
    },
    refresh() {
      const resolved = resolveTheme(get().preference);
      applyTheme(resolved);
      set({ resolved });
    },
  };
});

/** Keeps the document theme in sync with the store and with OS changes while "system" is chosen. */
export function useThemeSync(): void {
  const preference = useThemeStore((state) => state.preference);
  const refresh = useThemeStore((state) => state.refresh);

  useEffect(() => {
    refresh();
    if (preference !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener('change', refresh);
    return () => query.removeEventListener('change', refresh);
  }, [preference, refresh]);
}
