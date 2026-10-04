import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isThemePreference, resolveTheme, THEME_STORAGE_KEY, useThemeStore } from './theme';

function mockSystemDark(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark && query.includes('dark'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('validates preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('resolves "system" from the operating-system setting', () => {
    mockSystemDark(true);
    expect(resolveTheme('system')).toBe('dark');
    mockSystemDark(false);
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('applies and remembers a chosen theme', () => {
    mockSystemDark(false);
    useThemeStore.getState().setPreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');

    useThemeStore.getState().setPreference('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('re-evaluates the system theme on refresh', () => {
    mockSystemDark(false);
    useThemeStore.getState().setPreference('system');
    mockSystemDark(true);
    useThemeStore.getState().refresh();
    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
