import { expect, type Page, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { expectPageTitle } from './titles';

/**
 * Appearance (Phase 24, ADR-0043): Simplified UI is on for a new installation, palettes and the setting are
 * remembered across restarts, both interfaces offer the same controls, and every palette reads well in
 * both themes.
 */

const AUTH = { Authorization: `Bearer ${E2E_TOKEN}` };
const PALETTES = ['manuscript', 'graphite', 'sand', 'slate', 'sage', 'iris'];

async function openNote(page: Page): Promise<string> {
  const response = await page.request.post('/api/notes', {
    headers: AUTH,
    data: {
      title: 'Appearance check',
      content: '# Appearance check\n\nSee [[Nowhere]].',
      folder: '',
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function remember(page: Page, values: Record<string, string>) {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, values);
}

/** The names of every button in the main area, sorted (the controls a page offers). */
const buttonNames = (page: Page) =>
  page.locator('#main button, #main [role="separator"]').evaluateAll((elements) =>
    elements
      .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '')
      .filter(Boolean)
      .sort(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
});

test('a new installation starts simplified in the Manuscript palette; choices survive a restart', async ({
  page,
}) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-ui', 'simplified');
  await expect(html).toHaveAttribute('data-palette', 'manuscript');

  await page.goto('/settings');
  await page.getByRole('radio', { name: /^Iris/u }).click();
  await page.getByRole('switch', { name: 'Simplified UI' }).click();
  await expect(html).toHaveAttribute('data-palette', 'iris');
  await expect(html).toHaveAttribute('data-ui', 'standard');

  // Applied before the page renders, from what was remembered.
  await page.reload();
  await expect(html).toHaveAttribute('data-palette', 'iris');
  await expect(html).toHaveAttribute('data-ui', 'standard');
  await expect(page.getByRole('switch', { name: 'Simplified UI' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: /^Iris/u })).toBeChecked();
});

test('Simplified UI keeps every control of the Notes page', async ({ page }) => {
  const id = await openNote(page);
  await remember(page, { 'skb.ui': 'simplified', 'skb.notes.details': 'true' });
  await page.goto(`/notes/${id}`);
  await expect(page.locator('.cm-content')).toContainText('Appearance check');
  const simplified = await buttonNames(page);

  await remember(page, { 'skb.ui': 'standard' });
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Appearance check');
  const standard = await buttonNames(page);

  // The same controls; only the Notes header's "New note" is an icon in the tab row when simplified.
  expect(simplified.length).toBeGreaterThan(20);
  expect(new Set(simplified)).toEqual(new Set(standard));
});

test('every palette, in both themes and both interfaces, has no serious accessibility violations', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const id = await openNote(page);
  const failures: unknown[] = [];
  for (const palette of PALETTES)
    for (const theme of ['light', 'dark'])
      for (const ui of palette === 'manuscript' ? ['simplified', 'standard'] : ['simplified']) {
        await remember(page, {
          'skb.palette': palette,
          'skb.theme': theme,
          'skb.ui': ui,
          'skb.notes.details': 'true',
        });
        for (const path of [`/notes/${id}`, '/']) {
          await page.goto(path);
          await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
          if (path !== '/')
            await expect(page.locator('.cm-content')).toContainText('Appearance check');
          else await expectPageTitle(page, 'Today');
          const violations = await seriousViolations(page);
          if (violations.length > 0) failures.push({ palette, theme, ui, path, violations });
        }
      }
  expect(failures).toEqual([]);
});
