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

/**
 * Waits for finite animations and transitions to end (a toast fading in measures as low contrast
 * half-way). Endless ones (spinners) are ignored; if something never settles, the scan goes ahead
 * after a few seconds and reports what it sees.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
          ),
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => undefined);
}

/**
 * Serious and critical WCAG violations on the current page, after fitting it to the viewport.
 * `include` limits the scan to one part of the page (a panel beside a page whose own layout is still
 * settling, such as a PDF being drawn).
 */
export async function seriousViolations(
  page: Page,
  options: { include?: string; inPageOnly?: boolean } = {},
) {
  await fitViewportToContent(page);
  await settleAnimations(page);
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.include) builder.include(options.include);
  // An Electron window cannot open the blank page axe finishes its run in: run it in the page itself.
  if (options.inPageOnly) builder.setLegacyMode(true);
  const results = await builder.analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
}

/**
 * The page's outline as a screen reader walks it (Phase 21, task 21.02): how many `h1`s, and every
 * heading that skips a level after the one before it ("h4 Why" straight after an h2). Hidden headings
 * are left out, as a screen reader leaves them out.
 */
export async function headingOutline(page: Page): Promise<{ h1: number; skips: string[] }> {
  return page.evaluate(() => {
    const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((heading) => heading.getClientRects().length > 0)
      .map((heading) => ({ level: Number(heading.tagName[1]), text: heading.textContent ?? '' }));
    return {
      h1: levels.filter((heading) => heading.level === 1).length,
      skips: levels
        .filter(
          (heading, index) => index > 0 && heading.level > (levels[index - 1]?.level ?? 0) + 1,
        )
        .map((heading) => `h${heading.level} ${heading.text.trim()}`),
    };
  });
}
