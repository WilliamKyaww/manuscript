import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SECTIONS } from '../apps/web/src/app/sections';
import { E2E_TOKEN } from './constants';

/** Every route in the app, plus an unknown address that renders the not-found page. */
const ROUTES = [
  ...SECTIONS.map((section) => ({ path: section.path, title: section.label })),
  { path: '/no/such/page', title: 'Page not found' },
];

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test.describe('sticky headers (permanent requirement, ui.md §2)', () => {
  for (const route of ROUTES) {
    test(`the header stays fixed while ${route.path} scrolls`, async ({ page }) => {
      await page.goto(route.path);
      const title = page.getByRole('heading', { level: 1, name: route.title });
      await expect(title).toBeVisible();
      const header = page.locator('[data-page-header]');
      await expect(header).toHaveCount(1);
      const before = await header.boundingBox();

      // Make the body long enough to scroll whatever the page's real content is, then scroll to the end.
      const scroll = await page.locator('[data-page-body]').evaluate((body) => {
        const filler = document.createElement('div');
        filler.style.height = '4000px';
        (body.firstElementChild ?? body).appendChild(filler);
        body.scrollTop = body.scrollHeight;
        return { body: body.scrollTop, window: document.scrollingElement?.scrollTop ?? 0 };
      });

      expect(scroll.body).toBeGreaterThan(1000);
      expect(scroll.window).toBe(0);
      expect((await header.boundingBox())?.y).toBe(before?.y);
      await expect(header).toBeInViewport();
      await expect(title).toBeInViewport();
    });
  }

  test('section headers stick to the top of the page body', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/settings');
    const body = page.locator('[data-page-body]');
    const firstSectionHeader = page.locator('[data-sticky-header]').first();
    await expect(firstSectionHeader).toBeVisible();
    await body.evaluate((element) => {
      element.scrollTop = 60;
    });
    const bodyBox = await body.boundingBox();
    const stickyBox = await firstSectionHeader.boundingBox();
    expect(Math.round(stickyBox?.y ?? -1)).toBe(Math.round(bodyBox?.y ?? -2));
  });
});

test.describe('navigation and keyboard', () => {
  test('the command palette jumps to a section', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await page.keyboard.type('graph');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/graph$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Graph' })).toBeVisible();
    await expect(palette).toHaveCount(0);
  });

  test('collapsing the sidebar is remembered across reloads', async ({ page }) => {
    const sidebar = page.locator('[data-sidebar]');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await page.keyboard.press('Control+Backslash');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await page.reload();
    await expect(page.locator('[data-sidebar]')).toHaveAttribute('data-collapsed', 'true');
  });

  test('the chosen theme applies before the app renders after a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: /Dark/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Set by public/theme-init.js in <head>, before React mounts: no flash of the light theme.
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await expect(page.getByRole('radio', { name: /Dark/ })).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  test('the skip link moves focus to the main content', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('the cheat sheet opens with ? and closes with Escape', async ({ page }) => {
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Open the command palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('visiting every section produces no console errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${page.url()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`));
    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});

test.describe('accessibility (axe: no serious or critical violations)', () => {
  const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

  /**
   * axe only checks colour contrast for elements inside the viewport, and page bodies scroll
   * internally — so grow the viewport until the whole body fits before scanning.
   */
  async function fitViewportToContent(page: import('@playwright/test').Page) {
    const height = await page.evaluate(() => {
      const header = document.querySelector('[data-page-header]');
      const body = document.querySelector('[data-page-body]');
      return Math.ceil(
        (header?.getBoundingClientRect().height ?? 0) + (body?.scrollHeight ?? 0) + 40,
      );
    });
    const width = page.viewportSize()?.width ?? 1280;
    await page.setViewportSize({ width, height: Math.min(Math.max(height, 720), 8000) });
  }

  async function seriousViolations(page: import('@playwright/test').Page) {
    await fitViewportToContent(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        id: violation.id,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));
  }

  for (const scheme of ['light', 'dark'] as const) {
    for (const route of ROUTES) {
      test(`${route.path} (${scheme} theme)`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }

  test('open dialogues (command palette and shortcuts)', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('the collapsed sidebar', async ({ page }) => {
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('[data-sidebar]')).toHaveAttribute('data-collapsed', 'true');
    expect(await seriousViolations(page)).toEqual([]);
  });
});
