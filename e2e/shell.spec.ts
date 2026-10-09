import { expect, test } from '@playwright/test';
import { SECTIONS } from '../apps/web/src/app/sections';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';

/** Every route in the app, plus an unknown address that renders the not-found page. */
const ROUTES = [
  ...SECTIONS.map((section) => ({ path: section.path, title: section.label })),
  { path: '/practice/questions', title: 'Question bank' },
  { path: '/no/such/page', title: 'Page not found' },
];

/** Appends tall filler to a scroll container and scrolls it to the end (runs in the page). */
function fillAndScroll(element: Element) {
  const filler = document.createElement('div');
  filler.style.height = '4000px';
  (element.firstElementChild ?? element).appendChild(filler);
  element.scrollTop = element.scrollHeight;
  return { body: element.scrollTop, window: document.scrollingElement?.scrollTop ?? 0 };
}

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
      const body = page.locator('[data-page-body]');

      if ((await body.getAttribute('data-layout')) === 'panes') {
        // Paned pages: every pane keeps its own header above its own scroll container.
        const panes = page.locator('[data-pane]');
        expect(await panes.count()).toBeGreaterThan(0);
        for (const pane of await panes.all()) {
          const paneHeader = pane.locator('[data-pane-header]');
          const paneBefore = await paneHeader.boundingBox();
          const scrolled = await pane.locator('[data-pane-body]').evaluate(fillAndScroll);
          expect(scrolled.body).toBeGreaterThan(1000);
          expect(scrolled.window).toBe(0);
          expect((await paneHeader.boundingBox())?.y).toBe(paneBefore?.y);
          await expect(paneHeader).toBeInViewport();
        }
      } else {
        // Make the body long enough to scroll whatever the page's real content is, then scroll to the end.
        const scroll = await body.evaluate(fillAndScroll);
        expect(scroll.body).toBeGreaterThan(1000);
        expect(scroll.window).toBe(0);
      }
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
