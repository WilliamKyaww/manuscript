import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';

/**
 * The notes workspace of Phase 23 (tasks 23.02–23.09) against the real server: tabs and panes, the
 * file tree's menu, the More options menu, version history, bookmarks, merging, copies, moves,
 * export to PDF, a note's own window and the vault at the foot of the Files pane.
 */

const VAULT = path.join(process.env.SKB_E2E_DIR ?? '', 'vault');
const AUTH = { Authorization: `Bearer ${E2E_TOKEN}` };

const onDisk = (relative: string) => path.join(VAULT, ...relative.split('/'));
const readVault = (relative: string) =>
  existsSync(onDisk(relative)) ? readFileSync(onDisk(relative), 'utf8') : '';

async function createNote(page: Page, title: string, content: string, folder = '') {
  const response = await page.request.post('/api/notes', {
    headers: AUTH,
    data: { title, content, folder },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; path: string };
}

async function createFolder(page: Page, folder: string) {
  const response = await page.request.post('/api/folders', {
    headers: AUTH,
    data: { path: folder },
  });
  expect([201, 409]).toContain(response.status());
}

const tabs = (page: Page, pane = 'Open notes') =>
  page
    .getByRole('navigation', { name: pane })
    .locator('li')
    .evaluateAll((items) => items.map((item) => item.querySelector('button')?.textContent ?? ''));

async function openMenuOf(page: Page, name: string) {
  await page.getByRole('treeitem', { name, exact: true }).click({ button: 'right' });
  return page.getByRole('menu');
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();
});

test('tabs and a second pane: Ctrl+click, Split right, remembered across a reload', async ({
  page,
}) => {
  const first = await createNote(page, 'Tabs one', 'The first note.');
  await createNote(page, 'Tabs two', 'The second note.');
  await page.goto(`/notes/${first.id}`);
  await expect(page.locator('.cm-content')).toContainText('The first note.');

  await page
    .getByRole('treeitem', { name: 'Tabs two', exact: true })
    .click({ modifiers: ['Control'] });
  await expect(page.getByRole('heading', { level: 1, name: 'Tabs two' })).toBeVisible();
  expect(await tabs(page)).toEqual(['Tabs one', 'Tabs two']);

  // A middle click on a tab closes it; the other takes its place.
  await page
    .getByRole('navigation', { name: 'Open notes' })
    .getByRole('button', { name: 'Tabs two', exact: true })
    .click({ button: 'middle' });
  await expect(page.getByRole('heading', { level: 1, name: 'Tabs one' })).toBeVisible();

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Split right' }).click();
  const right = page.getByRole('navigation', { name: 'Open notes in the pane on the right' });
  await expect(right).toBeVisible();
  // Typing in one pane reaches the other, once saved.
  const editors = page.locator('.cm-content');
  await expect(editors).toHaveCount(2);
  await editors.nth(1).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(' Typed on the right.');
  await expect.poll(() => readVault(first.path)).toBe('The first note. Typed on the right.');
  await expect(editors.nth(0)).toContainText('Typed on the right.', { timeout: 15_000 });

  await page.reload();
  await expect(
    page.getByRole('navigation', { name: 'Open notes in the pane on the right' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Open notes in the pane on the right' })
    .getByRole('button', { name: 'Close Tabs one' })
    .click();
  await expect(page.getByRole('navigation', { name: 'Open notes' })).toBeVisible();
});

test('the file menu makes a copy without the id, moves to a folder and bookmarks', async ({
  page,
}) => {
  await createFolder(page, 'Menu target');
  const id = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5B1';
  const note = await createNote(page, 'Menu source', `---\nid: ${id}\ntags: [menu]\n---\nBody.`);
  expect(readVault(note.path)).toContain(id);
  await page.reload();

  let menu = await openMenuOf(page, 'Menu source');
  for (const item of [
    'Open in new tab',
    'Open to the right',
    'Open in new window',
    'Make a copy',
    'Move file to…',
    'Bookmark',
    'Merge entire file with…',
    'Copy path',
    'Open version history',
    'Open in default app',
    'Show in system explorer',
    'Rename…',
    'Delete',
  ])
    await expect(
      menu.getByRole('menuitem', { name: new RegExp(`^${item}`) }).first(),
    ).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Make a copy' }).click();
  await expect(page.getByRole('treeitem', { name: 'Menu source 1', exact: true })).toBeVisible();
  // A copy never shares the original's id.
  expect(readVault('Menu source 1.md')).toBe('---\ntags: [menu]\n---\nBody.');

  menu = await openMenuOf(page, 'Menu source 1');
  await menu.getByRole('menuitem', { name: 'Move file to…' }).click();
  const suggester = page.getByRole('dialog', { name: 'Move “Menu source 1” to a folder' });
  await suggester.getByRole('combobox').fill('Menu tar');
  await page.keyboard.press('Enter');
  await expect.poll(() => readVault('Menu target/Menu source 1.md')).toContain('Body.');

  menu = await openMenuOf(page, 'Menu source');
  await menu.getByRole('menuitem', { name: 'Bookmark' }).click();
  const bookmarks = page.getByRole('region', { name: 'Bookmarks' });
  await expect(bookmarks.getByRole('button', { name: 'Menu source', exact: true })).toBeVisible();
  await bookmarks.getByRole('button', { name: 'Remove the bookmark of Menu source' }).click();
  await expect(bookmarks).toHaveCount(0);
});

test('merging a note appends it to another, retargets links and trashes it', async ({ page }) => {
  const source = await createNote(page, 'Merge source', 'Text from the source.');
  const target = await createNote(page, 'Merge target', 'Text of the target.');
  const linking = await createNote(page, 'Merge linking', 'See [[Merge source]].');
  await page.reload();

  const menu = await openMenuOf(page, 'Merge source');
  await menu.getByRole('menuitem', { name: 'Merge entire file with…' }).click();
  await page.getByRole('combobox').fill('Merge target');
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog', { name: 'Merge “Merge source” into “Merge target”?' });
  await confirm.getByRole('button', { name: 'Merge' }).click();
  await expect
    .poll(() => readVault(target.path))
    .toBe('Text of the target.\n\nText from the source.');
  expect(existsSync(onDisk(source.path))).toBe(false);
  expect(readVault(linking.path)).toBe('See [[Merge target]].');
  await expect(page.getByRole('treeitem', { name: 'Merge source', exact: true })).toHaveCount(0);
});

test('version history lists the text a save replaced and restores it', async ({ page }) => {
  const note = await createNote(page, 'Versioned', 'First words.');
  await page.goto(`/notes/${note.id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(' Second words.');
  await expect.poll(() => readVault(note.path)).toBe('First words. Second words.');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Open version history' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version history of “Versioned”' });
  await expect(dialog.getByRole('list', { name: 'Versions' }).getByRole('listitem')).toHaveCount(1);
  await expect(dialog.getByRole('region', { name: 'The text of this version' })).toHaveText(
    'First words.',
  );
  await dialog.getByRole('button', { name: 'Changes since' }).click();
  await expect(dialog.getByRole('region', { name: 'Changes since this version' })).toContainText(
    'Second words.',
  );
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await expect.poll(() => readVault(note.path)).toBe('First words.');
  await expect(page.locator('.cm-content')).toHaveText('First words.', { timeout: 15_000 });
});

test('the More options menu finds and replaces, reveals the file and exports to PDF', async ({
  page,
}) => {
  await createFolder(page, 'Deep folder');
  const note = await createNote(page, 'Deep note', 'Find me here.', 'Deep folder');
  await page.goto(`/notes/${note.id}`);
  await expect(page.locator('.cm-content')).toContainText('Find me here.');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: /^Replace…/ }).click();
  await expect(page.locator('.cm-search input[name="replace"]')).toBeFocused();
  await page.keyboard.press('Escape');

  // Reveal: with every folder closed, the note is shown and focused in the tree again.
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('treeitem', { name: 'Deep note', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Reveal file in navigation' }).click();
  await expect(page.getByRole('treeitem', { name: 'Deep note', exact: true })).toBeFocused();

  // In a browser, Export to PDF prints a copy of the note made for printing.
  await page.evaluate(() => {
    (window as unknown as { printed: string }).printed = '';
    window.print = () => {
      (window as unknown as { printed: string }).printed =
        document.getElementById('skb-print-root')?.textContent ?? '';
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Export to PDF…' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: string }).printed))
    .toContain('Find me here.');
  await expect(page.locator('#skb-print-root')).toHaveCount(0);
});

test('a note opens in a window of its own, without the sidebar or the file list', async ({
  page,
}) => {
  const note = await createNote(page, 'Own window', 'Alone in its window.');
  await page.goto(`/notes/${note.id}`);
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Open in new window' }).click();
  const popup = await opened;
  await expect(popup.locator('.cm-content')).toContainText('Alone in its window.');
  await expect(popup.locator('[data-sidebar]')).toHaveCount(0);
  await expect(popup.getByRole('tree', { name: 'Notes and folders' })).toHaveCount(0);
  await popup.close();
});

test('the Files pane shows the open vault and opens another folder from there', async ({
  page,
}) => {
  const switcher = page.getByRole('button', { name: /^Vault: .+\. Change vault$/ });
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: 'Manage vaults…' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Open folder as vault…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open folder as vault' });
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-e2e-other-vault-'));
  try {
    await dialog.getByLabel('The folder’s path').fill(folder);
    await dialog.getByRole('button', { name: 'Look at it' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();
    // Opening it would restart the shared server on it, so the test stops here.
    await expect(dialog.getByRole('button', { name: 'Open this vault' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the workspace has no serious accessibility violations, with two panes and Details open', async ({
  page,
}) => {
  const note = await createNote(page, 'Accessible workspace', '# Heading\nText.');
  await page.goto(`/notes/${note.id}`);
  await page.getByRole('button', { name: 'Show details' }).click();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Split down' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Open notes in the pane below' }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  // Tall enough for the whole menu: in a shorter window it scrolls, its items reached with the
  // arrow keys (which axe does not count as keyboard access to a scrolling region).
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.getByRole('button', { name: 'More options' }).first().click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
