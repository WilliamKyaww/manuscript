import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** Accessibility scanning shared by the end-to-end tests (ui.md §7). */

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * axe only checks colour contrast for elements inside the viewport, and page bodies scroll
 * internally — so grow the viewport until the whole body fits before scanning.
 */
export async function fitViewportToContent(page: Page): Promise<void> {
  const height = await page.evaluate(() => {
    const header = document.querySelector('[data-page-header]');
    const body = document.querySelector('[data-page-body]');
    // Paned pages scroll inside each pane: size for the tallest pane instead.
    const scrollers = [
      ...document.querySelectorAll('[data-pane-body], [data-scroll-region], .cm-scroller'),
    ];
    const tallest = Math.max(
      body?.scrollHeight ?? 0,
      ...scrollers.map((element) => element.scrollHeight + 80),
    );
    return Math.ceil((header?.getBoundingClientRect().height ?? 0) + tallest + 40);
  });
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: Math.min(Math.max(height, 720), 8000) });
}

/** Serious and critical WCAG violations on the current page, after fitting it to the viewport. */
export async function seriousViolations(page: Page) {
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
