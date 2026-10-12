import { beforeEach, describe, expect, it, vi } from 'vitest';
import bootScript from '../../../public/theme-init.js?raw';
import { isPaletteId, PALETTES } from './appearance';

/** Appearance preferences (Phase 24, ADR-0043): defaults, persistence, and the boot script. */

const root = document.documentElement;

async function freshStore() {
  vi.resetModules();
  return (await import('./appearance')).useAppearance;
}

function boot() {
  new Function(bootScript)();
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.palette;
  delete root.dataset.ui;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});

describe('appearance preferences', () => {
  it('start as the Manuscript palette with Simplified UI on', async () => {
    const store = await freshStore();
    expect(store.getState()).toMatchObject({ palette: 'manuscript', simplified: true });
  });

  it('are remembered and applied to the document at once', async () => {
    let store = await freshStore();
    store.getState().setPalette('iris');
    store.getState().setSimplified(false);
    expect(root.dataset.palette).toBe('iris');
    expect(root.dataset.ui).toBe('standard');
    expect(localStorage.getItem('skb.palette')).toBe('iris');
    expect(localStorage.getItem('skb.ui')).toBe('standard');

    store = await freshStore();
    expect(store.getState()).toMatchObject({ palette: 'iris', simplified: false });
  });

  it('ignore a remembered palette that no longer exists', async () => {
    localStorage.setItem('skb.palette', 'neon');
    const store = await freshStore();
    expect(store.getState().palette).toBe('manuscript');
    expect(isPaletteId('neon')).toBe(false);
  });

  it('name six palettes, each with a preview for both themes', () => {
    expect(PALETTES.map((palette) => palette.id)).toEqual([
      'manuscript',
      'graphite',
      'sand',
      'slate',
      'sage',
      'iris',
    ]);
    for (const palette of PALETTES) {
      expect(Object.keys(palette.preview)).toEqual(['light', 'dark']);
      expect(palette.description).toMatch(/\.$/u);
    }
  });
});

describe('the boot script (before React loads)', () => {
  it('applies the defaults with nothing remembered', () => {
    boot();
    expect(root.dataset).toMatchObject({ theme: 'light', palette: 'manuscript', ui: 'simplified' });
  });

  it('applies what was remembered, and only palettes it knows', () => {
    localStorage.setItem('skb.theme', 'dark');
    localStorage.setItem('skb.palette', 'sage');
    localStorage.setItem('skb.ui', 'standard');
    boot();
    expect(root.dataset).toMatchObject({ theme: 'dark', palette: 'sage', ui: 'standard' });

    localStorage.setItem('skb.palette', 'neon');
    boot();
    expect(root.dataset.palette).toBe('manuscript');
  });

  it('knows the same palettes as the application', () => {
    for (const palette of PALETTES) expect(bootScript).toContain(`'${palette.id}'`);
  });
});
