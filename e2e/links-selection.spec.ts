import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';
import { expectPageTitle } from './titles';

/**
 * Links and selections (Phase 26, ADR-0045): the link card and the external-link mark, GitHub links as
 * mentions, opening links (here, a browser: a new tab), the selection toolbar, the editor's right-click
 * menu, extracting a selection, pasting rich text as Markdown, and AI on a selection (the test model).
 */

const VAULT = path.join(process.env.SKB_E2E_DIR ?? '', 'vault');
const AUTH = { Authorization: `Bearer ${E2E_TOKEN}` };
/** The AI test's own server (see AGENTS.md for the ports in use). */
const AI_PORT = 4384;

function readVault(relative: string, root = VAULT): string {
  const file = path.join(root, ...relative.split('/'));
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

async function createNote(page: Page, title: string, content: string, origin = '') {
  const response = await page.request.post(`${origin}/api/notes`, {
    headers: AUTH,
    data: { title, content },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; path: string };
}

async function openNote(page: Page, id: string, mode: 'edit' | 'preview', origin = '') {
  await page.evaluate((value) => localStorage.setItem('skb.notes.mode', value), mode);
  await page.goto(`${origin}/notes/${id}`);
}

/** Selects the first occurrence of `text` in the editor, as a person would with the mouse. */
async function select(page: Page, text: string) {
  // Focused, not clicked: a click could land on the toolbar of a selection made before.
  await page.locator('.cm-content').focus();
  // A DOM selection over the words; the editor takes it up as its own selection.
  await page.evaluate((wanted) => {
    const content = document.querySelector('.cm-content');
    if (!content) throw new Error('No editor');
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(wanted) ?? -1;
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`“${wanted}” is not in the editor`);
  }, text);
  // The toolbar waits for the pointer to be up and the selection to stay still.
  await page.mouse.move(5, 5);
}

/** A right click on the middle of the selection, which keeps it. */
async function rightClickSelection(page: Page) {
  const box = await page.evaluate(() => {
    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  });
  if (!box) throw new Error('Nothing is selected');
  await page.mouse.click(box.x, box.y, { button: 'right' });
}

const NOTE = `Plantvillage dataset: 70% train, 15% test

[Research paper](https://www.sciencedirect.com/science/article/pii/S0168169921005408)

GitHub repos: https://github.com/WilliamKyaww/plant-disease-detection

Models get near-perfect accuracy on lab photos.
`;

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  await expectPageTitle(page, 'Notes');
});

test('web links: the mark, the card on hover, GitHub mentions, and a click opens a new tab here', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const note = await createNote(page, 'Proposal links', NOTE);
  await openNote(page, note.id, 'edit');
  const editor = page.locator('.cm-content');
  const paper = editor.locator('[data-href*="sciencedirect"]').first();
  await expect(paper).toHaveText('Research paper');
  await expect(editor.locator('.cm-link-external-mark')).toHaveCount(1);
  await expect(editor.locator('.cm-github-chip')).toHaveText('plant-disease-detection');

  await paper.hover();
  const card = page.locator('[data-link-card]');
  await expect(card).toContainText('www.sciencedirect.com/science/article/pii/S0168169921005408');
  await card.getByRole('button', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://www.sciencedirect.com/science/article/pii/S0168169921005408',
  );
  await card.getByRole('button', { name: 'Edit' }).click();
  // Edit shows the source with the address selected.
  await expect(editor).toContainText('[Research paper](https://www.sciencedirect.com/');

  // A browser cannot show the page beside the note: the click opens it in a new tab.
  await page.locator('.cm-content').press('Control+End');
  const popup = page.waitForEvent('popup');
  await editor.locator('.cm-github-chip').click();
  expect((await popup).url()).toBe('https://github.com/WilliamKyaww/plant-disease-detection');

  await openNote(page, note.id, 'preview');
  const body = page.locator('.markdown-body');
  await expect(body.locator('a.external-link')).toHaveText('Research paper');
  await expect(body.locator('a.github-mention')).toHaveText('plant-disease-detection');
  await body.locator('a.external-link').hover();
  await expect(page.locator('[data-link-card]')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('the selection toolbar formats and turns lines into blocks; the menu does the rest', async ({
  page,
}) => {
  const note = await createNote(page, 'Toolbar note', 'First line of text\n\nSecond line here\n');
  await openNote(page, note.id, 'edit');
  await select(page, 'line of');
  const toolbar = page.getByRole('toolbar', { name: 'Format the selection' });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => readVault(note.path)).toContain('First **line of** text');

  await toolbar.getByRole('button', { name: /Turn into/ }).click();
  await page.getByRole('menuitemradio', { name: 'Heading 2' }).click();
  await expect.poll(() => readVault(note.path)).toContain('## First **line of** text');
  expect(await seriousViolations(page)).toEqual([]);

  // The right-click menu: Format, Paragraph and Insert, as in Obsidian.
  await select(page, 'Second');
  await rightClickSelection(page);
  await page.getByRole('menuitem', { name: 'Format' }).hover();
  await page.getByRole('menuitem', { name: 'Strikethrough' }).click();
  await expect.poll(() => readVault(note.path)).toContain('~~Second~~ line here');
  await select(page, 'line here');
  await rightClickSelection(page);
  await page.getByRole('menuitem', { name: 'Paragraph' }).hover();
  await page.getByRole('menuitem', { name: 'Task list' }).click();
  await expect.poll(() => readVault(note.path)).toContain('- [ ] ~~Second~~ line here');
});

test('a selection can be extracted to a new note, and rich text pastes as Markdown', async ({
  page,
}) => {
  const note = await createNote(
    page,
    'Extract source',
    'Intro.\n\nGrad-CAM shows where the model looks.\n',
  );
  await openNote(page, note.id, 'edit');
  await select(page, 'Grad-CAM shows where the model looks.');
  await page
    .getByRole('toolbar', { name: 'Format the selection' })
    .getByRole('button', { name: 'More' })
    .click();
  await page.getByRole('menuitem', { name: 'Extract selection to a new note…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Extract to a new note' });
  await dialog.getByLabel('Title of the new note').fill('Grad-CAM');
  await dialog.getByRole('button', { name: 'Extract' }).click();
  await expect.poll(() => readVault(note.path)).toBe('Intro.\n\n[[Grad-CAM]]\n');
  expect(readVault('Grad-CAM.md')).toContain('Grad-CAM shows where the model looks.');

  // Pasting from a web page: headings, emphasis and links come as Markdown.
  await page.locator('.cm-content').press('Control+End');
  await page.locator('.cm-content').evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<h3>Results</h3><p>Accuracy is <strong>high</strong>, see <a href="https://example.org">this</a>.</p>',
    );
    data.setData('text/plain', 'Results Accuracy is high, see this.');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect
    .poll(() => readVault(note.path))
    .toContain('### Results\n\nAccuracy is **high**, see [this](https://example.org).');
});

test('AI on a selection: a suggestion to accept, from the test model', async ({ browser }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-ai-'));
  const server = await startServer(dir, AI_PORT, { SKB_AI_PROVIDER: 'mock' });
  const origin = `http://127.0.0.1:${AI_PORT}`;
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/notes`);
    await expectPageTitle(page, 'Notes');
    const note = await createNote(
      page,
      'AI note',
      'models do well on lab photos. they do worse in fields\n',
      origin,
    );
    await openNote(page, note.id, 'edit', origin);
    await select(page, 'models do well on lab photos. they do worse in fields');
    await page
      .getByRole('toolbar', { name: 'Format the selection' })
      .getByRole('button', { name: /Ask AI/ })
      .click();
    await page.getByRole('menuitem', { name: 'Improve writing' }).click();
    const panel = page.getByRole('dialog', { name: 'Improve writing' });
    await expect(panel).toContainText('Models do well on lab photos. They do worse in fields.');
    await panel.getByRole('button', { name: 'Replace selection' }).click();
    await expect
      .poll(() => readVault(note.path, path.join(dir, 'vault')))
      .toBe('Models do well on lab photos. They do worse in fields.\n');
    // Undo puts the original back: the suggestion was one edit.
    await page.locator('.cm-content').press('Control+z');
    await expect
      .poll(() => readVault(note.path, path.join(dir, 'vault')))
      .toBe('models do well on lab photos. they do worse in fields\n');
  } finally {
    await context.close();
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});
