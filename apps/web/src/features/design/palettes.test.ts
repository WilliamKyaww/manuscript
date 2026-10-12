import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../app/theme/appearance';
import tokensCss from '../../styles/tokens.css?raw';

/**
 * Every palette in both themes (Phase 24, ADR-0043): text, accent, buttons and focus meet WCAG 2.2 AA on
 * every surface they are drawn on. Values are read from tokens.css as the browser would cascade them:
 * the base theme, then the palette's overrides.
 */

type Tokens = Record<string, string>;

function block(selector: string): Tokens {
  const start = tokensCss.indexOf(`${selector} {`);
  if (start === -1) return {};
  const body = tokensCss.slice(start, tokensCss.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--skb-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/giu)].map((m) => [m[1], m[2]]),
  );
}

function tokensFor(theme: 'light' | 'dark', palette: string): Tokens {
  const base =
    theme === 'light' ? block(':root,\n[data-theme="light"]') : block('[data-theme="dark"]');
  return { ...base, ...block(`:root[data-theme="${theme}"][data-palette="${palette}"]`) };
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const SURFACES = ['bg', 'surface', 'surface-sunken', 'surface-hover'];

describe('palettes', () => {
  for (const palette of PALETTES)
    for (const theme of ['light', 'dark'] as const)
      it(`${palette.name} (${theme}) meets WCAG AA for text, accent, buttons and focus`, () => {
        const t = tokensFor(theme, palette.id);
        const failures: string[] = [];
        const check = (fg: string, bg: string, minimum: number) => {
          const ratio = contrast(t[fg] ?? '', t[bg] ?? '');
          if (!(ratio >= minimum)) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
        };
        for (const text of ['text', 'text-muted', 'text-subtle'])
          for (const surface of SURFACES) check(text, surface, 4.5);
        for (const surface of ['bg', 'surface', 'surface-sunken', 'accent-subtle'])
          check('accent', surface, 4.5);
        check('text', 'accent-subtle', 4.5);
        check('accent-contrast', 'accent', 4.5);
        check('accent-contrast', 'accent-hover', 4.5);
        for (const surface of ['bg', 'surface']) check('focus', surface, 3);
        expect(failures).toEqual([]);
      });

  it('override only neutrals and the accent: status colours mean the same in every palette', () => {
    for (const palette of PALETTES)
      for (const theme of ['light', 'dark'] as const) {
        const overrides = Object.keys(
          block(`:root[data-theme="${theme}"][data-palette="${palette.id}"]`),
        );
        for (const name of overrides)
          expect(name).toMatch(/^(bg|surface.*|border.*|text.*|accent.*|focus)$/u);
      }
  });

  it('match the previews shown in Settings', () => {
    for (const palette of PALETTES)
      for (const theme of ['light', 'dark'] as const) {
        const t = tokensFor(theme, palette.id);
        expect(palette.preview[theme]).toMatchObject({
          bg: t.bg,
          text: t.text,
          accent: t.accent,
        });
      }
  });
});
