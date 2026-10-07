import { type ChildProcess, fork } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { E2E_TOKEN } from './constants';

/** The vault the Playwright web server uses (see playwright.config.ts). */
const VAULT = path.join(process.env.SKB_E2E_DIR ?? '', 'vault');

function vaultFile(relative: string, root = VAULT): string {
  return path.join(root, ...relative.split('/'));
}

function readVault(relative: string, root = VAULT): string {
  const file = vaultFile(relative, root);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/** Writes a file the way another program would: straight to disk, behind the server's back. */
function writeVault(relative: string, content: string): void {
  mkdirSync(path.dirname(vaultFile(relative)), { recursive: true });
  writeFileSync(vaultFile(relative), content);
}

async function createNote(
  page: Page,
  title: string,
  content: string,
  origin = '',
): Promise<{ id: string; path: string }> {
  const response = await page.request.post(`${origin}/api/notes`, {
    headers: { Authorization: `Bearer ${E2E_TOKEN}` },
    data: { title, content },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; path: string };
}

async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible();
});

test('a link to a new note shows up as a backlink there', async ({ page }) => {
  await page.getByRole('button', { name: 'New note' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New note' });
  await dialog.getByLabel('Title').fill('Consensus overview');
  await dialog.getByRole('button', { name: 'Create note' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Consensus overview' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Consensus overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await typeAtEnd(page, 'Paxos is safe. See [[Leader election]] for details.');
  await expect
    .poll(() => readVault('Consensus overview.md'))
    .toBe('Paxos is safe. See [[Leader election]] for details.');
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: /^Saved/ })).toBeVisible();

  // The link points nowhere yet: create the note from the preview.
  await page.getByLabel('Preview', { exact: true }).click();
  await page.getByRole('button', { name: 'Leader election' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Leader election' })).toBeVisible();

  await page.getByRole('tab', { name: 'Backlinks' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Backlinks' });
  await expect(panel.getByRole('link', { name: 'Consensus overview' })).toBeVisible();
  await expect(
    panel.getByText('Paxos is safe. See [[Leader election]] for details.'),
  ).toBeVisible();

  // Following the backlink opens the linking note.
  await panel.getByRole('link', { name: 'Consensus overview' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Consensus overview' })).toBeVisible();
  await page.getByLabel('Edit', { exact: true }).click();
});

test('an edit made in another program appears in the open editor, and never overwrites unsaved work silently', async ({
  page,
}) => {
  const note = await createNote(page, 'Edited elsewhere', 'Original text.');
  await page.goto(`/notes/${note.id}`);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Original text.');

  writeVault(note.path, 'Changed in another editor.');
  await expect(editor).toContainText('Changed in another editor.', { timeout: 15_000 });

  // Now with unsaved changes here: a conflict is raised instead of either side being lost.
  await typeAtEnd(page, ' Mine.');
  writeVault(note.path, 'Theirs, again.');
  const banner = page.getByRole('alert').filter({ hasText: 'changed outside the editor' });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  expect(readVault(note.path)).toBe('Theirs, again.');

  await banner.getByRole('button', { name: 'Compare' }).click();
  const compare = page.getByRole('dialog', { name: 'Compare versions' });
  await expect(compare.getByText('Theirs, again.')).toBeVisible();
  await compare.getByRole('button', { name: 'Keep my version' }).click();
  await expect.poll(() => readVault(note.path)).toBe('Changed in another editor. Mine.');
  await expect(banner).toHaveCount(0);
});

test('renaming a note updates links to it', async ({ page }) => {
  const target = await createNote(page, 'Rename target', '# Target');
  await createNote(page, 'Rename source', 'Points at [[Rename target]].');
  await page.goto(`/notes/${target.id}`);
  const item = page.getByRole('treeitem', { name: 'Rename target' });
  await item.focus();
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: 'New name' });
  await input.fill('Renamed target');
  await input.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Update links?' });
  await expect(dialog).toContainText('Rename source.md');
  await dialog.getByRole('button', { name: 'Update links and move' }).click();
  await expect.poll(() => readVault('Rename source.md')).toBe('Points at [[Renamed target]].');
  await expect(page.getByRole('treeitem', { name: 'Renamed target' })).toBeVisible();
  // The open note keeps its id, so the address still works.
  await expect(page).toHaveURL(new RegExp(`/notes/${target.id}$`));
});

test('the editor and details panes keep their headers while scrolling a long note', async ({
  page,
}) => {
  const lines = Array.from({ length: 300 }, (_, index) => `Line ${index + 1} of a long note.`).join(
    '\n',
  );
  const note = await createNote(page, 'Long note', `# Long note\n${lines}`);
  await page.goto(`/notes/${note.id}`);
  await expect(page.locator('.cm-content')).toContainText('Line 1 of a long note.');
  const paneHeaders = page.locator('[data-pane-header]');
  const before = await Promise.all((await paneHeaders.all()).map((header) => header.boundingBox()));
  const scrolled = await page.locator('.cm-scroller').evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight;
    return scroller.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(1000);
  const after = await Promise.all((await paneHeaders.all()).map((header) => header.boundingBox()));
  expect(after.map((box) => box?.y)).toEqual(before.map((box) => box?.y));
  await expect(page.locator('[data-page-header]')).toBeInViewport();
});

test('the notes page has no serious accessibility violations', async ({ page }) => {
  const note = await createNote(
    page,
    'Accessible note',
    '# Heading\n\nText with [[Consensus overview]] and #tag.\n\n> [!tip] Callout\n> Body.',
  );
  for (const mode of ['Edit', 'Split', 'Preview'] as const) {
    await page.goto(`/notes/${note.id}`);
    await page.getByLabel(mode, { exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Accessible note' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        mode,
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));
    expect(serious).toEqual([]);
  }
  await page.getByLabel('Edit', { exact: true }).click();
  await page.getByRole('button', { name: 'New note' }).first().click();
  await expect(page.getByRole('dialog', { name: 'New note' })).toBeVisible();
  const dialogResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    dialogResults.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
});

test.describe('persistence', () => {
  const PORT = 4398;
  const origin = `http://127.0.0.1:${PORT}`;

  function start(dir: string): Promise<ChildProcess> {
    const child = fork(path.resolve('apps/server/dist/server.mjs'), ['--port', String(PORT)], {
      env: {
        ...process.env,
        SKB_VAULT: path.join(dir, 'vault'),
        SKB_DATA_DIR: path.join(dir, 'data'),
        SKB_AUTH_TOKEN: E2E_TOKEN,
        SKB_LOG_LEVEL: 'warn',
        SKB_NO_BROWSER: '1',
      },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    return new Promise((resolve, reject) => {
      child.on(
        'message',
        (message: { type?: string }) => message?.type === 'skb:ready' && resolve(child),
      );
      child.once('exit', (code) => reject(new Error(`The server exited early (code ${code}).`)));
    });
  }

  function stop(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      child.send({ type: 'skb:shutdown' });
    });
  }

  test('notes and their content survive a server restart', async ({ page }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-restart-'));
    let server = await start(dir);
    try {
      await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/notes`);
      await page.getByRole('button', { name: 'New note' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'New note' });
      await dialog.getByLabel('Title').fill('Persistent');
      await dialog.getByRole('button', { name: 'Create note' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Persistent' })).toBeVisible();
      const id = page.url().split('/').pop() ?? '';
      await typeAtEnd(page, 'Survives restarts.');
      await expect
        .poll(() => readVault('Persistent.md', path.join(dir, 'vault')))
        .toBe('Survives restarts.');

      await stop(server);
      server = await start(dir);
      await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/notes`);
      await page.getByRole('treeitem', { name: 'Persistent' }).click();
      await expect(page.locator('.cm-content')).toContainText('Survives restarts.');
      // The index survived too: the note kept its id.
      expect(page.url()).toContain(id);
    } finally {
      await stop(server);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
