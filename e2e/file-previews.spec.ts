import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron as electron, expect, test } from '@playwright/test';
import { makeOfficeDocument, makeWorkbook } from '../apps/server/test/fixtures/file-previews';
import { makePdf } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { electronExecutable, isolatedEnvironment, removeQuietly } from './desktop-harness';

const office =
  process.env.SKB_LIBREOFFICE_PATH ?? 'C:/Program Files/LibreOffice/program/soffice.exe';
test('file tabs render documents, data, images and safe HTML; mode switches preserve notes', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  const upload = async (name: string, bytes: string | Uint8Array) => {
    const response = await page.request.post('/api/attachments', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
      multipart: {
        file: {
          name,
          mimeType: 'application/octet-stream',
          buffer: typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes),
        },
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).path as string;
  };
  const documents: Record<string, string | Uint8Array> = {
    'preview.txt': 'Plain text remains readable.',
    'preview.csv': 'Plant,Score\n"Tomato, red",95',
    'preview.json': '{"answer":42}',
    'preview.xml': '<research><plant>Tomato</plant></research>',
    'preview.py': 'def study():\n    return 42',
    'preview.js': 'const answer = 42;',
    'preview.c': 'int main(void) { return 0; }',
    'preview.html': '<h1>HTML document</h1><script>window.previewExecuted = true</script>',
    'preview.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#609080"/><script>window.previewExecuted = true</script></svg>',
    'preview.gif': Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    ),
    'preview.pdf': makePdf([['PDF preview fixture']]),
    'preview.docx': makeOfficeDocument([
      { heading: 1, text: 'Word report' },
      { p: 'Readable Word content.' },
    ]),
    'preview.xlsx': makeWorkbook(),
  };
  for (const [extension, mime] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ]) {
    const data = await page.evaluate((mime) => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas');
      context.fillStyle = '#609080';
      context.fillRect(0, 0, 160, 80);
      return canvas.toDataURL(mime).split(',')[1];
    }, mime);
    documents[`preview.${extension}`] = Buffer.from(data ?? '', 'base64');
  }
  if (existsSync(office)) {
    const temporary = mkdtempSync(path.join(tmpdir(), 'skb-e2e-preview-doc-'));
    try {
      writeFileSync(path.join(temporary, 'preview.docx'), documents['preview.docx'] ?? '');
      execFileSync(
        office,
        [
          `-env:UserInstallation=${pathToFileURL(path.join(temporary, 'profile')).href}`,
          '--headless',
          '--convert-to',
          'doc:MS Word 97',
          '--outdir',
          temporary,
          path.join(temporary, 'preview.docx'),
        ],
        { windowsHide: true, timeout: 45_000 },
      );
      documents['preview.doc'] = readFileSync(path.join(temporary, 'preview.doc'));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  const paths = new Map<string, string>();
  for (const [name, content] of Object.entries(documents))
    paths.set(name, await upload(name, content));
  await page.getByRole('button', { name: 'Show attachments', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Attachments', exact: true }).click();
  const openFile = async (name: string) => {
    await page.getByRole('treeitem', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  };
  await openFile('preview.csv');
  await expect(page.getByRole('table')).toContainText('Tomato, red');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('[data-file-preview] pre')).toContainText('"Tomato, red",95');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  expect(
    await seriousViolations(page, { include: '[data-file-preview]', inPageOnly: true }),
  ).toEqual([]);
  if (process.env.SKB_SCREENSHOTS) {
    mkdirSync(process.env.SKB_SCREENSHOTS, { recursive: true });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [1280, 760]) {
        await page.setViewportSize({ width, height: 800 });
        await page.screenshot({
          path: path.join(process.env.SKB_SCREENSHOTS, `files-csv-${theme}-${width}.png`),
        });
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  for (const name of [
    'preview.txt',
    'preview.json',
    'preview.xml',
    'preview.py',
    'preview.js',
    'preview.c',
  ]) {
    await openFile(name);
    await expect(page.locator('[data-file-preview] pre')).not.toBeEmpty();
  }
  await openFile('preview.html');
  const html = page.frameLocator('iframe[title="HTML preview: preview.html"]');
  await expect(html.getByRole('heading', { name: 'HTML document' })).toBeVisible();
  expect(
    await html
      .locator('body')
      .evaluate(() => (window as unknown as { previewExecuted?: boolean }).previewExecuted),
  ).toBeUndefined();
  for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp']) {
    await openFile(`preview.${extension}`);
    await expect
      .poll(() =>
        page
          .locator('[data-file-preview] img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await openFile('preview.pdf');
  await expect(page.locator('[data-file-preview] canvas').first()).toBeVisible();
  for (const name of [
    'preview.docx',
    'preview.xlsx',
    ...(paths.has('preview.doc') ? ['preview.doc'] : []),
  ]) {
    await openFile(name);
    await expect(page.locator('[data-file-preview]')).toContainText(
      name.endsWith('xlsx') ? 'Tomato' : 'Readable Word content.',
    );
    if (name.endsWith('xlsx')) {
      await page.getByLabel('Sheet', { exact: true }).selectOption('1');
      await expect(page.getByRole('table')).toContainText('Overall result');
    }
    await page.getByRole('button', { name: 'Page layout', exact: true }).click();
    if (existsSync(office))
      await expect(page.locator('[data-file-preview] canvas').first()).toBeVisible({
        timeout: 60_000,
      });
    else await expect(page.locator('[data-file-preview]')).toContainText('needs LibreOffice');
    if (process.env.SKB_SCREENSHOTS && name === 'preview.docx')
      await page.screenshot({
        path: path.join(process.env.SKB_SCREENSHOTS, 'files-word-layout.png'),
      });
    await page.getByRole('button', { name: 'Reading', exact: true }).click();
    if (process.env.SKB_SCREENSHOTS && name === 'preview.docx')
      await page.screenshot({
        path: path.join(process.env.SKB_SCREENSHOTS, 'files-word-reading.png'),
      });
  }
  await page.reload();
  await expect(page.locator('[data-file-preview]')).toBeVisible();
  await page.getByRole('button', { name: 'New note', exact: true }).first().click();
  const dialogue = page.getByRole('dialog', { name: 'New note' });
  await dialogue.getByLabel('Title').fill('Beside file previews');
  await dialogue.getByRole('button', { name: 'Create note' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').fill('Notes still work.');
  await openFile('preview.txt');
  await expect(page.locator('[data-file-preview] pre')).toContainText(
    'Plain text remains readable.',
  );
  await page.getByRole('treeitem', { name: 'Beside file previews', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Notes still work.');
});

test('desktop file tabs render an attachment-only vault and switch Office viewing modes', async () => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-desktop-files-'));
  const vault = path.join(dir, 'vault');
  mkdirSync(vault);
  writeFileSync(
    path.join(vault, 'report.docx'),
    makeOfficeDocument([
      { heading: 1, text: 'Desktop report' },
      { p: 'Desktop file preview content.' },
    ]),
  );
  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [path.resolve('apps/desktop')],
    env: isolatedEnvironment(dir, vault),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await page.goto(`${new URL(page.url()).origin}/notes`);
    await page.getByRole('button', { name: 'Show attachments', exact: true }).click();
    await page.getByRole('treeitem', { name: 'report.docx', exact: true }).click();
    await expect(page.locator('[data-file-preview]')).toContainText(
      'Desktop file preview content.',
    );
    await page.getByRole('button', { name: 'Page layout', exact: true }).click();
    if (existsSync(office))
      await expect(page.locator('[data-file-preview] canvas').first()).toBeVisible({
        timeout: 60_000,
      });
    else await expect(page.locator('[data-file-preview]')).toContainText('needs LibreOffice');
    await page.getByRole('button', { name: 'Reading', exact: true }).click();
    await expect(page.locator('[data-file-preview]')).toContainText(
      'Desktop file preview content.',
    );
    await page.getByRole('button', { name: 'Close report.docx', exact: true }).click();
    await expect(page.locator('[data-file-preview]')).toHaveCount(0);
  } finally {
    await app.close();
    removeQuietly(dir);
  }
});
