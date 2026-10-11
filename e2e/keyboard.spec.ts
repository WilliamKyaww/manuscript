import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Phase 21, task 21.02: a study session with the keyboard alone — skip to the page, make a note by
 * name and write in it, add a flashcard, review it, read the cheat sheet, go to Settings. Nothing is
 * clicked after signing in. On a server of its own, so the review queue holds just this card.
 */

/** The next free own-server port (AGENTS.md §5). */
const PORT = 4386;
const origin = `http://127.0.0.1:${PORT}`;

/** Presses Tab until `target` has focus: it must be reachable from the keyboard, and soon. */
async function tabTo(page: Page, target: Locator, most = 25): Promise<void> {
  for (let presses = 0; presses < most; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, `not reached within ${most} presses of Tab`).toBeFocused();
}

test('a study session with the keyboard alone', async ({ page }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-keyboard-'));
  const server = await startServer(dir, PORT);
  try {
    const set = await page.request.post(`${origin}/api/card-sets`, {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
      data: { title: 'Consensus' },
    });
    expect(set.status()).toBe(201);
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // The skip link comes first and takes focus to the page.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();

    // A note by name from anywhere; a new note opens ready to write in.
    await page.keyboard.press('Control+o');
    await expect(page.getByRole('dialog', { name: 'Open a note' })).toBeVisible();
    await page.keyboard.type('Keyboard only');
    await page.keyboard.press('Shift+Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Keyboard only' })).toBeVisible();
    await expect(page.locator('.cm-content')).toBeFocused();
    await page.keyboard.type('Raft elects one leader per term.');
    await page.keyboard.press('Control+s');
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /^Saved/ })).toBeVisible();

    // A flashcard from anywhere, even from inside the editor.
    await page.keyboard.press('Control+Shift+A');
    const editor = page.getByRole('dialog', { name: 'New card' });
    await expect(editor).toBeVisible();
    await tabTo(page, editor.getByLabel('Front'));
    await page.keyboard.type('What does Raft elect in each term?');
    await tabTo(page, editor.getByLabel('Back'));
    await page.keyboard.type('One leader.');
    await tabTo(page, editor.getByRole('button', { name: 'Add card' }));
    await page.keyboard.press('Enter');
    await expect(editor).toBeHidden();

    // Reviewing it: the command palette, then Space to show the answer and 4 for Easy (a new card
    // rated Good comes back after a learning step, so the session would not end yet).
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Review due cards');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Question' })).toContainText(
      'What does Raft elect in each term?',
    );
    await page.keyboard.press('Space');
    await expect(page.getByRole('region', { name: 'Answer' })).toContainText('One leader.');
    await page.keyboard.press('4');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();

    // The cheat sheet opens and closes, and focus comes back to where it was.
    await page.keyboard.press('?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet.getByRole('region', { name: 'Review session' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Anywhere else by name; the new page's heading takes focus.
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Settings');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
