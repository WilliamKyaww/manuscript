import { expect, type Page, test } from '@playwright/test';
import { E2E_TOKEN } from './constants';
import { expectPageTitle } from './titles';

/** Task 4.10: search finds text, filters narrow results, a result opens the note at the match. */

async function createNote(page: Page, title: string, content: string): Promise<{ id: string }> {
  const response = await page.request.post('/api/notes', {
    headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    data: { title, content },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

const filler = Array.from(
  { length: 40 },
  (_, index) => `Line ${index + 1} of background text.`,
).join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
});

test('search finds text, filters narrow the results and a result opens at the match', async ({
  page,
}) => {
  await createNote(
    page,
    'Zephyr consensus',
    `---\ntags: [exam]\n---\n# Zephyr consensus\n${filler}\nThe zephyrquorum rule needs a majority.`,
  );
  await createNote(page, 'Zephyr draft', '---\ntags: [draft]\n---\nAnother zephyrquorum mention.');

  await page.keyboard.press('Control+Shift+F');
  await expectPageTitle(page, 'Search');
  const input = page.getByRole('searchbox', { name: 'Search notes and sources' });
  await expect(input).toBeFocused();
  await input.fill('zephyrquorum');
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(results.getByRole('link')).toHaveCount(2);
  await expect(page).toHaveURL(/q=zephyrquorum/);
  await expect(results.locator('mark').first()).toHaveText(/zephyrquorum/i);

  // A filter narrows the results; removing it widens them again.
  await page.getByRole('combobox', { name: 'Add a tag filter' }).selectOption('exam');
  await expect(results.getByRole('link')).toHaveCount(1);
  await expect(input).toHaveValue('zephyrquorum tag:exam');
  await page.getByRole('button', { name: 'Remove the tag filter exam' }).click();
  await expect(results.getByRole('link')).toHaveCount(2);
  await input.fill('zephyrquorum -tag:draft');
  await expect(results.getByRole('link')).toHaveCount(1);

  // Opening the result goes to the line with the match.
  await results.getByRole('link', { name: /Zephyr consensus/ }).click();
  await expectPageTitle(page, 'Zephyr consensus');
  // 3 frontmatter lines, the heading and 40 filler lines come first.
  await expect(page).toHaveURL(/line=45/);
  await expect(page.locator('.cm-activeLine')).toContainText(
    'The zephyrquorum rule needs a majority.',
  );
});

test('hostile queries never break the page', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  for (const query of [
    '"unbalanced',
    'NEAR(a b)',
    '***',
    'a AND OR NOT',
    "'; DROP TABLE notes; --",
    'tag:',
  ]) {
    await page.goto(`/search?q=${encodeURIComponent(query)}`);
    await expectPageTitle(page, 'Search');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});

test('the quick switcher opens notes by name, alias or recent use', async ({ page }) => {
  const note = await createNote(
    page,
    'Byzantine fault tolerance',
    '---\naliases: [BFT]\n---\n# Byzantine fault tolerance',
  );
  await page.goto('/notes');
  await expectPageTitle(page, 'Notes');
  await page.keyboard.press('Control+o');
  const dialog = page.getByRole('dialog', { name: 'Open a note' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('bft');
  await expect(
    dialog.getByRole('option', { name: /BFT → Byzantine fault tolerance/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
  await expectPageTitle(page, 'Byzantine fault tolerance');

  // Now it is the most recent note.
  await page.keyboard.press('Control+o');
  await expect(dialog.getByText('Recently opened')).toBeVisible();
  await expect(dialog.getByRole('option').first()).toContainText('Byzantine fault tolerance');
  await page.keyboard.press('Escape');
});

test('the command palette searches notes', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await page.keyboard.type('zephyrquorum');
  await palette.getByRole('option', { name: 'Search for “zephyrquorum”' }).click();
  await expect(page).toHaveURL(/\/search\?q=zephyrquorum/);
  await expect(
    page.getByRole('list', { name: 'Search results' }).getByRole('link').first(),
  ).toBeVisible();
});
