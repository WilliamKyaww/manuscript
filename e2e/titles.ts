import { expect, type Page } from '@playwright/test';

/**
 * A page's title (its one h1). It is visible, except where the page shows it elsewhere: with Simplified UI
 * the Notes page folds its header into the tab row, keeping the h1 only for screen readers and keyboard
 * focus (`[data-header-hidden]`, ADR-0043). Either way the h1 must be there with the right name.
 */
export async function expectPageTitle(
  page: Page,
  name: string | RegExp,
  options: { timeout?: number } = {},
): Promise<void> {
  const title = page.getByRole('heading', { level: 1, name });
  await expect(title).toBeAttached(options);
  const hidden = await title.evaluate(
    (element) => element.closest('[data-header-hidden]') !== null,
  );
  if (!hidden) await expect(title).toBeVisible(options);
}

/** Whether the page's header is the visually hidden one (the Notes page in Simplified UI). */
export async function headerHidden(page: Page): Promise<boolean> {
  return (await page.locator('[data-page-header][data-header-hidden]').count()) > 0;
}
