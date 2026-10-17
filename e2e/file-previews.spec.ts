import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron as electron, expect, type Page, test } from '@playwright/test';
import {
  makeOfficeDocument,
  makeSparseWorkbook,
  makeWorkbook,
} from '../apps/server/test/fixtures/file-previews';
import { makePdf } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { electronExecutable, isolatedEnvironment, removeQuietly } from './desktop-harness';

const office =
  process.env.SKB_LIBREOFFICE_PATH ?? 'C:/Program Files/LibreOffice/program/soffice.exe';

/** A real binary .doc, which nothing else here can write: LibreOffice saves a .docx as one. */
function legacyWordFile(docx: Uint8Array): Buffer | null {
  if (!existsSync(office)) return null;
  const temporary = mkdtempSync(path.join(tmpdir(), 'skb-e2e-preview-doc-'));
  try {
    writeFileSync(path.join(temporary, 'preview.docx'), docx);
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
    return readFileSync(path.join(temporary, 'preview.doc'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
/** Pictures of what the student sees, in both themes, when SKB_SCREENSHOTS names a folder. */
async function capture(page: Page, name: string) {
  const folder = process.env.SKB_SCREENSHOTS;
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(folder, `files-${name}-${theme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });
}

/** Serious WCAG violations in the preview, in both themes (the viewport is grown to fit what it holds). */
async function expectAccessible(page: Page) {
  const size = page.viewportSize();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      await seriousViolations(page, { include: '[data-file-preview]', inPageOnly: true }),
      `accessibility in the ${theme} theme`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
  if (size) await page.setViewportSize(size);
}

/**
 * The viewer is a thumbnail pane beside a pages pane. Placed in a column they stack at twice the
 * height and push the file's own header out of view, which a "some canvas is visible" check misses
 * because the thumbnail is a canvas too.
 */
async function expectPagesBesideThumbnails(page: Page) {
  const frame = page.locator('[data-file-preview] [data-pdf-frame]');
  await expect(frame.locator('section[aria-label^="Page "] canvas').first()).toBeVisible({
    timeout: 60_000,
  });
  const [thumbnails, pages, header, area] = await Promise.all([
    frame.locator('[data-pane]').first().boundingBox(),
    frame.locator('[data-pane]').nth(1).boundingBox(),
    page.locator('[data-file-preview] > header').boundingBox(),
    frame.boundingBox(),
  ]);
  if (!thumbnails || !pages || !header || !area) throw new Error('The viewer is not laid out');
  expect(pages.x).toBeGreaterThanOrEqual(thumbnails.x + thumbnails.width - 1);
  expect(Math.abs(pages.y - thumbnails.y)).toBeLessThan(2);
  expect(pages.height).toBeLessThanOrEqual(area.height + 1);
  expect(header.y).toBeGreaterThanOrEqual(0);
  await expect(page.locator('[data-file-preview] > header h2')).toBeInViewport();
}

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
  const legacyDoc = legacyWordFile(documents['preview.docx'] as Uint8Array);
  if (legacyDoc) documents['preview.doc'] = legacyDoc;
  const paths = new Map<string, string>();
  for (const [name, content] of Object.entries(documents))
    paths.set(name, await upload(name, content));
  await page.getByRole('button', { name: 'Show attachments', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Attachments', exact: true }).click();
  const openFile = async (name: string) => {
    await page.getByRole('treeitem', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    // With a dozen files open the row of tabs scrolls: the open one must not be out of sight.
    await expect
      .poll(async () => {
        const row = await page.locator('[data-tab-bar] nav').first().boundingBox();
        const tab = await page
          .locator('[data-tab-bar] [aria-current="page"]')
          .first()
          .boundingBox();
        return Boolean(
          row && tab && tab.x >= row.x - 1 && tab.x + tab.width <= row.x + row.width + 1,
        );
      })
      .toBe(true);
  };
  await openFile('preview.csv');
  await expect(page.getByRole('table')).toContainText('Tomato, red');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('[data-file-preview] pre')).toContainText('"Tomato, red",95');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  expect(
    await seriousViolations(page, { include: '[data-file-preview]', inPageOnly: true }),
  ).toEqual([]);
  await capture(page, 'csv');
  if (process.env.SKB_SCREENSHOTS) {
    await page.setViewportSize({ width: 760, height: 800 });
    await capture(page, 'csv-760');
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
    await capture(page, name.replace('preview.', 'text-'));
  }
  await openFile('preview.html');
  const html = page.frameLocator('iframe[title="HTML preview: preview.html"]');
  await expect(html.getByRole('heading', { name: 'HTML document' })).toBeVisible();
  await capture(page, 'html');
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
    if (extension === 'svg') await capture(page, 'image');
  }
  await openFile('preview.pdf');
  await expectPagesBesideThumbnails(page);
  await expectAccessible(page);
  await capture(page, 'pdf');
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
    await capture(page, `${name.split('.')[1]}-reading`);
    if (name !== 'preview.doc') await expectAccessible(page);
    await page.getByRole('button', { name: 'Page layout', exact: true }).click();
    if (existsSync(office)) {
      await expectPagesBesideThumbnails(page);
      if (name === 'preview.docx') await expectAccessible(page);
      await capture(page, `${name.split('.')[1]}-layout`);
    } else await expect(page.locator('[data-file-preview]')).toContainText('needs LibreOffice');
    await page.getByRole('button', { name: 'Reading', exact: true }).click();
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

test('files that cannot be shown say why, and data keeps its numbers and row addresses', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`/auth?token=${E2E_TOKEN}&next=/notes`);
  const upload = async (name: string, bytes: string | Uint8Array) => {
    const response = await page.request.post('/api/attachments', {
      headers: { Authorization: `Bearer ${E2E_TOKEN}` },
      multipart: {
        file: { name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) },
      },
    });
    expect(response.status()).toBe(201);
  };
  await upload('states-empty.txt', '');
  await upload('states-damaged.docx', 'PK this is not a Word document');
  await upload('states-unknown.bin', 'unknown');
  await upload('states-huge.txt', 'x'.repeat(2 * 1024 * 1024 + 1));
  await upload('states-ids.json', '{"id":12345678901234567890,"ratio":1.0}');
  await upload('states-sparse.xlsx', makeSparseWorkbook());
  await page.getByRole('button', { name: 'Show attachments', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Attachments', exact: true }).click();
  const openFile = async (name: string) => {
    await page.getByRole('treeitem', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  };
  const alert = page.locator('[data-file-preview] [role="alert"]');

  await openFile('states-unknown.bin');
  await expect(page.locator('[data-file-preview]')).toContainText('A preview is not available');
  await expectAccessible(page);
  await capture(page, 'state-unsupported');

  await openFile('states-huge.txt');
  await expect(alert).toContainText('too large to preview');
  await expect(alert.getByRole('heading')).toHaveText('This file cannot be previewed');
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  await expectAccessible(page);
  await capture(page, 'state-too-large');

  await openFile('states-damaged.docx');
  await expect(alert).toContainText('is damaged or is not a valid Office file');
  await page.getByRole('button', { name: 'Page layout', exact: true }).click();
  await expect(alert).toContainText(
    existsSync(office) ? 'could not be prepared' : 'needs LibreOffice',
    { timeout: 60_000 },
  );
  await expect(alert.getByRole('heading')).toHaveText('Page layout is not available');
  // The way back to the readable view is still there.
  await expect(page.getByRole('button', { name: 'Reading', exact: true })).toBeInViewport();
  await expectAccessible(page);
  await capture(page, 'state-layout-failed');

  await openFile('states-ids.json');
  await expect(page.locator('[data-file-preview]')).toContainText('12345678901234567890');
  await expect(page.locator('[data-file-preview]')).toContainText('"ratio": 1.0');

  await openFile('states-sparse.xlsx');
  const table = page.getByRole('table', { name: 'Results' });
  await expect(table.getByRole('rowheader')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(table.getByRole('row', { name: /^3 Third row/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /^5 .*5$/ })).toBeVisible();
  await expectAccessible(page);
  await capture(page, 'xlsx-sparse');

  await openFile('states-empty.txt');
  await expect(page.locator('[data-file-preview]')).toContainText('This file is empty.');
  await expectAccessible(page);
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
    if (existsSync(office)) await expectPagesBesideThumbnails(page);
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

/** `desktop:build` (our own layout) and `desktop:dist` (electron-builder's, which the installer holds). */
const packagedBuilds = [
  {
    name: 'the unpacked build',
    folder: `${process.platform}-unpacked`,
    how: 'npm run desktop:build',
  },
  { name: "the installer's payload", folder: 'win-unpacked', how: 'npm run desktop:dist' },
];
const executable = process.platform === 'win32' ? 'Manuscript.exe' : 'Manuscript';

for (const build of packagedBuilds) {
  const packaged = path.resolve('apps/desktop/release', build.folder, executable);
  test(`${build.name} reads a legacy Word file in its worker and prepares a page layout`, async () => {
    test.skip(!existsSync(packaged), `Run "${build.how}" first.`);
    test.skip(!existsSync(office), 'LibreOffice is needed to make a binary .doc.');
    test.setTimeout(180_000);
    const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-packaged-files-'));
    const vault = path.join(dir, 'vault');
    mkdirSync(vault);
    const docx = makeOfficeDocument([
      { heading: 1, text: 'Packaged report' },
      { p: 'Legacy Word text from the packaged worker.' },
    ]);
    writeFileSync(path.join(vault, 'legacy.doc'), legacyWordFile(docx) ?? '');
    writeFileSync(path.join(vault, 'results.xlsx'), makeWorkbook());
    // The worker and the bundled word-extractor sit beside the server in the package.
    expect(
      existsSync(path.join(path.dirname(packaged), 'resources/server/file-preview-worker.mjs')),
    ).toBe(true);
    const app = await electron.launch({
      executablePath: packaged,
      args: [],
      cwd: dir,
      env: isolatedEnvironment(dir, vault),
    });
    try {
      const page = await app.firstWindow();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
        timeout: 90_000,
      });
      expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
      await page.goto(`${new URL(page.url()).origin}/notes`);
      await page.getByRole('button', { name: 'Show attachments', exact: true }).click();
      for (const [name, text] of [
        ['legacy.doc', 'Legacy Word text from the packaged worker.'],
        ['results.xlsx', 'Tomato'],
      ]) {
        await page.getByRole('treeitem', { name, exact: true }).click();
        await expect(page.locator('[data-file-preview]')).toContainText(text as string);
        await page.getByRole('button', { name: 'Page layout', exact: true }).click();
        await expectPagesBesideThumbnails(page);
        await page.getByRole('button', { name: 'Reading', exact: true }).click();
      }
    } finally {
      await app.close();
      removeQuietly(dir);
    }
  });
}
