import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Task 8.13: create cards → review them → the schedule persists across a restart → undo restores
 * a rating. On a server of its own, so the restart and the counts are this test's alone.
 */

/** Not the shared server's 4399, nor the notes restart test's 4398. */
const PORT = 4397;
const origin = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

test('cards are reviewed by keyboard, undo restores a rating, and schedules survive a restart', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-review-'));
  let server = await startServer(dir, PORT);
  try {
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/review`);
    await expect(page.getByRole('heading', { name: 'No flashcards yet' })).toBeVisible();

    // A set, a basic card from the set page, and a cloze card through quick add.
    await page.getByRole('button', { name: 'New set' }).click();
    const setDialog = page.getByRole('dialog', { name: 'New card set' });
    await setDialog.getByLabel('Title').fill('Consensus');
    await setDialog.getByRole('button', { name: 'Create set' }).click();
    await page.getByRole('link', { name: 'Consensus', exact: true }).click();
    await page.locator('[data-page-header]').getByRole('button', { name: 'New card' }).click();
    let editor = page.getByRole('dialog', { name: 'New card' });
    await editor.getByLabel('Front').fill('Which algorithm elects a leader per term?');
    await editor.getByLabel('Back').fill('Raft');
    await editor.getByRole('button', { name: 'Add card' }).click();
    await expect(editor).toBeHidden();
    await page.keyboard.press('Control+Shift+A');
    editor = page.getByRole('dialog', { name: 'New card' });
    await editor.getByRole('radio', { name: 'Cloze' }).check({ force: true });
    await editor.getByLabel('Text').fill('A {{c1::quorum}} is a majority of acceptors.');
    await expect(editor.getByRole('region', { name: 'Preview' })).toContainText(
      'A […] is a majority',
    );
    await editor.getByRole('button', { name: 'Add card' }).click();
    await expect(editor).toBeHidden();
    const cards = page.getByRole('table');
    await expect(cards.getByRole('row')).toHaveCount(3);
    expect(await seriousViolations(page)).toEqual([]);

    // Review: Space shows the answer, 3 is Good; the second face is rated Again, then undone.
    await page.locator('[data-page-header] a[href^="/review/session"]').click();
    const question = page.getByRole('region', { name: 'Question' });
    await expect(question).toContainText('Which algorithm elects a leader per term?');
    await page.keyboard.press('Space');
    await expect(page.getByRole('region', { name: 'Answer' })).toContainText('Raft');
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press('3');
    await expect(question).toContainText('A […] is a majority of acceptors.');
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAccessibleName('1 of 2 reviewed');
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    // Again: back in a minute, so it returns in this session (learning faces due within 20
    // minutes do), and the first card is still learning too.
    await expect(progress).toHaveAccessibleName('2 of 4 reviewed');
    await page.keyboard.press('Control+Z');
    await expect(progress).toHaveAccessibleName('1 of 3 reviewed');
    await expect(question).toContainText('A […] is a majority of acceptors.');
    await expect(page.getByText('New', { exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('4');
    // The first card's second Good graduates it.
    await expect(question).toContainText('Which algorithm elects a leader per term?');
    await page.keyboard.press('Space');
    await page.keyboard.press('3');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await expect(page.getByText('3 reviews', { exact: false })).toBeVisible();

    const faces = async () => {
      const sets = await (
        await page.request.get(`${origin}/api/card-sets`, { headers: auth })
      ).json();
      const detail = await (
        await page.request.get(`${origin}/api/card-sets/${sets.sets[0].id}`, { headers: auth })
      ).json();
      return detail.cards.map((card: { kind: string; faces: unknown[] }) => [
        card.kind,
        card.faces,
      ]);
    };
    const before = await faces();
    // The undone Again left no trace: Easy took the cloze face straight to review.
    expect(
      before.map(([kind, list]: [string, { state: string; reps: number }[]]) => [
        kind,
        list[0]?.state,
        list[0]?.reps,
      ]),
    ).toEqual([
      ['basic', 'review', 2],
      ['cloze', 'review', 1],
    ]);

    await stopServer(server);
    server = await startServer(dir, PORT);
    expect(await faces()).toEqual(before);
    await page.goto(`${origin}/review`);
    await expect(
      page.getByRole('list', { name: 'Card sets' }).getByText('Consensus'),
    ).toBeVisible();
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
