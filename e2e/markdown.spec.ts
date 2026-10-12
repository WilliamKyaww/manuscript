import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { E2E_TOKEN } from './constants';
import { expectPageTitle } from './titles';

/**
 * Markdown as Obsidian writes it (Phase 25, ADR-0044): the editor draws tables, lists, tasks and callouts
 * away from the cursor, a task's checkbox writes back to the file, and the reading view follows
 * Obsidian's line breaks unless "Strict line breaks" is on.
 */

const VAULT = path.join(process.env.SKB_E2E_DIR ?? '', 'vault');
const AUTH = { Authorization: `Bearer ${E2E_TOKEN}` };

function readVault(relative: string): string {
  const file = path.join(VAULT, ...relative.split('/'));
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

async function createNote(page: Page, title: string, content: string) {
  const response = await page.request.post('/api/notes', {
    headers: AUTH,
    data: { title, content },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; path: string };
}

async function openIn(page: Page, id: string, mode: 'edit' | 'preview') {
  await page.evaluate((value) => localStorage.setItem('skb.notes.mode', value), mode);
  await page.goto(`/notes/${id}`);
}

const NOTE = `# Features

Text below the heading, with the cursor elsewhere.

- First
- Second
    - Nested

- [ ] Open task
- [x] Done task

| Algorithm | Messages |
|:----------|---------:|
| Paxos | O(n) |
| Raft | O(n) |

> [!faq] Why?
> Because.

$$
x^2
$$
`;

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  await expectPageTitle(page, 'Notes');
});

test('the editor draws a table, bullets, tasks, callouts and maths, and a checkbox edits the file', async ({
  page,
}) => {
  const note = await createNote(page, 'Markdown features', NOTE);
  await openIn(page, note.id, 'edit');
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();

  await expect(editor.locator('.cm-table-widget table')).toBeVisible();
  await expect(editor.locator('.cm-table-widget tbody tr')).toHaveCount(2);
  await expect(editor.locator('.cm-list-bullet')).toHaveCount(3);
  await expect(editor.locator('.cm-task-box')).toHaveCount(2);
  await expect(editor.locator('.cm-callout-head')).toHaveCount(1);
  await expect(editor.locator('.cm-math-display')).toHaveCount(1);

  await editor.locator('.cm-task-box').first().click();
  await expect.poll(() => readVault(note.path)).toContain('- [x] Open task');
  expect(readVault(note.path)).toContain('- [x] Done task');
});

test('the reading view keeps single line breaks until Strict line breaks is turned on', async ({
  page,
}) => {
  const note = await createNote(page, 'Line breaks', 'first line\nsecond line\n\n==🟢green==');
  await openIn(page, note.id, 'preview');
  const body = page.locator('.markdown-body');
  await expect(body.locator('mark.hl-green')).toHaveText('green');
  await expect(body.locator('p').first().locator('br')).toHaveCount(1);

  await page.goto('/settings');
  await page.getByRole('switch', { name: 'Strict line breaks' }).click();
  await expect(page.getByRole('switch', { name: 'Strict line breaks' })).toBeChecked();

  await page.goto(`/notes/${note.id}`);
  await expect(body.locator('mark.hl-green')).toHaveText('green');
  await expect(body.locator('p').first().locator('br')).toHaveCount(0);
});
