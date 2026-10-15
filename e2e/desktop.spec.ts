import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SECTIONS } from '../apps/web/src/app/sections';
import { headingOutline, seriousViolations } from './axe';
import {
  captureWebPane,
  electronExecutable,
  isolatedEnvironment,
  removeQuietly,
} from './desktop-harness';
import { expectPageTitle } from './titles';

/**
 * Task 18.09: the desktop shell, for real. Electron starts the server in a utility process, the
 * window shows the application signed in, the page has the bridge and nothing of Node, a link to the
 * web does not turn the window into a browser, and quitting releases the vault.
 */

const root = process.cwd();

test('the desktop shell starts, shows the application, keeps the page confined, and quits cleanly', async () => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-desktop-'));
  const vault = path.join(dir, 'vault');
  const data = path.join(dir, 'data');
  const env = isolatedEnvironment(dir, vault);

  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [path.join(root, 'apps', 'desktop')],
    cwd: root,
    env,
  });
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', {
      timeout: 90_000,
    });

    // Signed in by the shell: the API answers with no sign-in step.
    const health = await page.evaluate(async () => {
      const response = await fetch('/api/health');
      return (await response.json()) as { status: string; vault: { path: string } };
    });
    expect(health.status).toBe('ok');
    expect(path.resolve(health.vault.path)).toBe(path.resolve(vault));

    // The page has the bridge and none of Node.
    const surface = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        bridge: Object.keys((w.skbDesktop ?? {}) as Record<string, unknown>).sort(),
        require: typeof w.require,
        process: typeof w.process,
      };
    });
    expect(surface).toEqual({
      bridge: [
        'appInfo',
        'openPath',
        'pickFiles',
        'pickFolder',
        'printToPdf',
        'revealInExplorer',
        'setTitleBarColours',
        'web',
      ],
      require: 'undefined',
      process: 'undefined',
    });
    const info = await page.evaluate(() =>
      (
        window as unknown as {
          skbDesktop: { appInfo(): Promise<{ platform: string; secrets: string }> };
        }
      ).skbDesktop.appInfo(),
    );
    expect(info.platform).toContain(process.platform);
    expect(['encrypted', 'file']).toContain(info.secrets);

    // The application works: a note made in the window is a file in the vault.
    await page.getByRole('link', { name: 'Notes', exact: true }).first().click();
    await page.getByRole('button', { name: 'New note' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New note' });
    await dialog.getByLabel('Title').fill('Desktop smoke note');
    await dialog.getByRole('button', { name: 'Create note' }).click();
    await expectPageTitle(page, 'Desktop smoke note');
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('Written in the desktop window.');
    await expect
      .poll(
        () => {
          const file = path.join(vault, 'Desktop smoke note.md');
          return existsSync(file) ? readFileSync(file, 'utf8') : '';
        },
        { timeout: 20_000 },
      )
      .toContain('Written in the desktop window.');

    // The slim title bar (task 23.10): the page draws the strip the window is dragged by, and the
    // menu's shortcuts still work though no menu bar is shown.
    await expect(page.locator('[data-title-bar]')).toBeVisible();
    if (process.env.SKB_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.SKB_SCREENSHOTS, 'desktop-title-bar.png'),
      });
    const zoom = () =>
      app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomLevel() ?? 0,
      );
    // Through Electron's input path: keys sent by the test driver never reach the menu.
    const press = (keyCode: string) =>
      app.evaluate(({ BrowserWindow }, key) => {
        const contents = BrowserWindow.getAllWindows()[0]?.webContents;
        contents?.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control'] });
        contents?.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control'] });
      }, keyCode);
    expect(await zoom()).toBe(0);
    await press('-');
    await expect.poll(zoom).toBeLessThan(0);
    await press('0');
    await expect.poll(zoom).toBe(0);

    // "Open in new window": a note of the application, in a window of its own without the sidebar.
    const noteId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    const opened = app.waitForEvent('window');
    await page.evaluate(
      (id) => window.open(`/notes/${id}?window=note`, `note-${id}`, 'popup'),
      noteId,
    );
    const own = await opened;
    await expect(own.locator('.cm-content')).toContainText('Written in the desktop window.', {
      timeout: 30_000,
    });
    await expect(own.locator('[data-sidebar]')).toHaveCount(0);
    await own.close();
    expect(app.windows()).toHaveLength(1);

    // A link to the web is not shown in this window.
    const origin = new URL(page.url()).origin;
    await page.evaluate(() => {
      window.open('https://example.org/', '_blank');
      const link = document.createElement('a');
      link.href = 'https://example.org/navigated';
      link.textContent = 'out';
      document.body.append(link);
      link.click();
    });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).origin).toBe(origin);
    expect(app.windows()).toHaveLength(1);

    // Opening another vault restarts the engine under the same window, signed in again.
    const other = path.join(dir, 'second vault');
    const switched = await page.evaluate(async (target) => {
      const response = await fetch('/api/data/vaults/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      return (await response.json()) as { restarting: boolean };
    }, other);
    expect(switched.restarting).toBe(true);
    // The engine comes back on the same port (so the page keeps its preferences), with the other vault.
    await expect
      .poll(
        () =>
          page
            .evaluate(async () => {
              const response = await fetch('/api/health');
              return ((await response.json()) as { vault: { path: string } }).vault.path;
            })
            .then((found) => path.resolve(found))
            .catch(() => ''),
        { timeout: 60_000 },
      )
      .toBe(path.resolve(other));
    expect(new URL(page.url()).origin).toBe(origin);
    await expectPageTitle(page, 'Today', {
      timeout: 60_000,
    });
    expect(existsSync(path.join(vault, '.skb', 'lock'))).toBe(false);
  } finally {
    await app.close();
  }

  // Quitting stopped the server and released the vault.
  await expect
    .poll(() => existsSync(path.join(vault, '.skb', 'lock')), { timeout: 15_000 })
    .toBe(false);
  expect(readFileSync(path.join(data, 'window-state.json'), 'utf8')).toContain('width');
  removeQuietly(dir);
});

test('appearance chosen in the desktop app is still there after quitting and starting it again', async () => {
  test.setTimeout(240_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-desktop-prefs-'));
  const env = isolatedEnvironment(dir, path.join(dir, 'vault'));
  const launch = () =>
    electron.launch({
      executablePath: electronExecutable(),
      args: [path.join(root, 'apps', 'desktop')],
      cwd: root,
      env,
    });

  let app = await launch();
  let origin = '';
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', { timeout: 90_000 });
    origin = new URL(page.url()).origin;
    await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
    await page.getByRole('radio', { name: /^Sage/u }).click();
    await page.getByRole('switch', { name: 'Simplified UI' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'sage');
  } finally {
    await app.close();
  }

  app = await launch();
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', { timeout: 90_000 });
    // The same address as before (the port is remembered), so the page's storage is the same.
    expect(new URL(page.url()).origin).toBe(origin);
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'sage');
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'standard');
  } finally {
    await app.close();
  }
  removeQuietly(dir);
});

/** Every page of the application, as `shell.spec.ts` visits them in the browser. */
const ROUTES = [
  ...SECTIONS.map((section) => ({ path: section.path, title: section.label })),
  { path: '/practice/questions', title: 'Question bank' },
  { path: '/diagnostics', title: 'Diagnostics' },
  { path: '/design-system', title: 'Design system' },
];

test('every page works in the desktop window as it does in the browser', async () => {
  // Phase 21, task 21.07: the browser's checks of every page, in the desktop window. The start-up
  // time is recorded as an annotation for the performance report (task 21.06).
  test.setTimeout(300_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-parity-'));
  const env = isolatedEnvironment(dir, path.join(dir, 'vault'));
  const launched = performance.now();
  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [path.join(root, 'apps', 'desktop')],
    cwd: root,
    env,
  });
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', {
      timeout: 90_000,
    });
    test.info().annotations.push({
      type: 'start-up',
      description: `${Math.round(performance.now() - launched)} ms from launch to Today`,
    });
    const origin = new URL(page.url()).origin;
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${page.url()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`));
    for (const route of ROUTES) {
      await page.goto(`${origin}${route.path}`);
      await expectPageTitle(page, route.title);
      await expect(page.locator('[data-page-header]')).toHaveCount(1);
      expect(await seriousViolations(page, { inPageOnly: true }), route.path).toEqual([]);
      expect(await headingOutline(page), route.path).toEqual({ h1: 1, skips: [] });
    }
    expect(problems).toEqual([]);

    // Where the browser copies a path, the desktop window can pick a folder and show one.
    await page.goto(`${origin}/settings`);
    await expect(page.getByRole('button', { name: /Browse/u }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show in folder' }).first()).toBeVisible();
  } finally {
    await app.close();
  }
  removeQuietly(dir);
});

const exe = process.platform === 'win32' ? 'Manuscript.exe' : 'Manuscript';
const release = path.join(root, 'apps', 'desktop', 'release');
/** `desktop:build` (our own layout) and `desktop:dist` (electron-builder's, which the installer holds). */
const packagedBuilds = [
  {
    name: 'the unpacked build',
    folder: `${process.platform}-unpacked`,
    how: 'npm run desktop:build',
  },
  { name: "the installer's payload", folder: 'win-unpacked', how: 'npm run desktop:dist' },
];

for (const build of packagedBuilds) {
  const packaged = path.join(release, build.folder, exe);
  test(`${build.name} runs the same way, as a packaged application`, async () => {
    test.skip(!existsSync(packaged), `Run "${build.how}" first.`);
    test.setTimeout(180_000);
    const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-packaged-'));
    const vault = path.join(dir, 'vault');
    const env = isolatedEnvironment(dir, vault);

    const app = await electron.launch({ executablePath: packaged, args: [], cwd: dir, env });
    try {
      const page = await app.firstWindow();
      await expectPageTitle(page, 'Today', {
        timeout: 90_000,
      });
      expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
      const health = await page.evaluate(async () => (await fetch('/api/health')).json());
      expect((health as { status: string }).status).toBe('ok');
    } finally {
      await app.close();
    }
    await expect
      .poll(() => existsSync(path.join(vault, '.skb', 'lock')), { timeout: 15_000 })
      .toBe(false);
    removeQuietly(dir);
  });
}

test('a web link opens beside the note, in a page of its own that cannot reach the application', async () => {
  test.setTimeout(180_000);
  // A small site of the test's own, so that nothing here needs the internet.
  const site = createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(
      request.url === '/second'
        ? '<title>Second page</title><h1>Second</h1>'
        : '<title>Test paper</title><h1>A paper</h1><a id="next" href="/second" target="_blank">Next</a>',
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const paper = `http://127.0.0.1:${(site.address() as AddressInfo).port}/paper`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-desktop-web-'));
  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [path.join(root, 'apps', 'desktop')],
    cwd: root,
    env: { ...isolatedEnvironment(dir, path.join(dir, 'vault')), SKB_BROWSER_ENGINE: 'electron' },
  });
  const pages = () =>
    app.evaluate(({ BrowserWindow }) =>
      (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((child) => {
        const view = child as unknown as {
          webContents?: { getURL(): string };
          getVisible(): boolean;
        };
        return { url: view.webContents?.getURL() ?? '', visible: view.getVisible() };
      }),
    );
  const inPage = (script: string) =>
    app.evaluate(async ({ BrowserWindow }, code) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children[0] as unknown as {
        webContents: { executeJavaScript(code: string): Promise<unknown> };
      };
      return child.webContents.executeJavaScript(code);
    }, script);
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', { timeout: 90_000 });
    const origin = new URL(page.url()).origin;
    const note = await page.evaluate(async (address) => {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Below the first line, where the cursor starts (it would show the link's source).
        body: JSON.stringify({
          title: 'Reading list',
          content: `To read:\n\n[The paper](${address})\n`,
        }),
      });
      return (await response.json()) as { id: string };
    }, paper);
    await page.evaluate(() => localStorage.setItem('skb.notes.mode', 'edit'));
    await page.goto(`${origin}/notes/${note.id}`);
    await page.locator('.cm-content .cm-link[data-href]').click();

    // The page is on the right of the note; its native bounds follow the actual DOM host.
    await expect(page.locator('[data-web-tab]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test paper', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(pages).toEqual([{ url: paper, visible: true }]);
    const checkLayout = async () => {
      const [left, right] = await page.locator('[data-editor-pane]').all();
      if (!left || !right) throw new Error('Missing notes/browser panes');
      await expect(left.locator('.cm-content')).toContainText('The paper');
      await expect(right.locator('[data-web-tab]')).toBeVisible();
      const noteBox = await left.boundingBox();
      const browserBox = await right.boundingBox();
      if (!noteBox || !browserBox) throw new Error('Missing pane bounds');
      expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(browserBox.x + 1);
      expect(noteBox.width).toBeGreaterThan(200);
      expect(browserBox.width).toBeGreaterThan(200);
      await expect
        .poll(async () => {
          const box = await page.locator('[data-web-view-host]').boundingBox();
          const bounds = await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.contentView.children[0]?.getBounds(),
          );
          return Boolean(
            box &&
              bounds &&
              Math.abs(bounds.x - box.x) <= 1 &&
              Math.abs(bounds.y - box.y) <= 1 &&
              Math.abs(bounds.width - box.width) <= 1 &&
              Math.abs(bounds.height - box.height) <= 1,
          );
        })
        .toBe(true);
    };
    for (const width of [1400, 1000]) {
      await app.evaluate(({ BrowserWindow }, value) => {
        BrowserWindow.getAllWindows()[0]?.setSize(value, 800);
      }, width);
      await checkLayout();
      await captureWebPane(app, `web-pane-right-${width}`);
    }

    // Dragging the pane divider changes the native browser bounds too.
    const divider = page.locator('#skb-panes-right [role="separator"]');
    const handle = await divider.boundingBox();
    if (!handle) throw new Error('Missing pane divider');
    await page.mouse.move(handle.x, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 35, handle.y + handle.height / 2);
    await page.mouse.up();
    await checkLayout();

    // It is the web, not the application: no cookie of the app, no Node, and no way into the app.
    expect(await inPage('document.cookie + "|" + typeof require + "|" + typeof process')).toBe(
      '|undefined|undefined',
    );
    await inPage(`location.href = ${JSON.stringify(`${origin}/`)}; 1`);
    await page.waitForTimeout(500);
    expect((await pages())[0]?.url).toBe(paper);

    // A link meant for a new tab stays in the pane; Back goes back.
    await inPage("document.getElementById('next').click(); 1");
    await expect(page.getByRole('button', { name: 'Second page', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'Test paper', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // A dialogue is not hidden behind the page: the page steps aside and leaves a picture of itself.
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(async () => (await pages())[0]?.visible).toBe(false);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pages())[0]?.visible).toBe(true);

    // Closing the tab lets the page go.
    await page.getByRole('button', { name: 'Close Test paper' }).click();
    await expect.poll(pages).toEqual([]);
    await expect(page.locator('[data-editor-pane]')).toHaveCount(1);
    await page.locator('.cm-content .cm-link[data-href]').click();
    await expect.poll(pages).toEqual([{ url: paper, visible: true }]);
    await checkLayout();

    // Navigating and editing notes keeps the browser open, on the right.
    await page.getByRole('button', { name: 'New note', exact: true }).first().click();
    const dialogue = page.getByRole('dialog', { name: 'New note' });
    await dialogue.getByLabel('Title').fill('Beside the browser');
    await dialogue.getByRole('button', { name: 'Create note' }).click();
    const editor = page.locator('[data-editor-pane]').first().locator('.cm-content');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.insertText('Notes still save beside the browser.');
    await expect
      .poll(() => {
        const file = path.join(dir, 'vault', 'Beside the browser.md');
        return existsSync(file) ? readFileSync(file, 'utf8') : '';
      })
      .toContain('Notes still save beside the browser.');
    await page.getByRole('treeitem', { name: 'Reading list', exact: true }).click();
    await checkLayout();
    // A restored Phase 26 layout is repaired without losing either tab.
    await page.evaluate(() => {
      const raw = localStorage.getItem('skb.notes.workspace');
      if (!raw) throw new Error('No saved workspace');
      const saved = JSON.parse(raw) as { panes: unknown[] };
      saved.panes.reverse();
      localStorage.setItem('skb.notes.workspace', JSON.stringify(saved));
    });
    await page.reload();
    await expect.poll(pages).toEqual([{ url: paper, visible: true }]);
    await checkLayout();
  } finally {
    await app.close();
    site.close();
    removeQuietly(dir);
  }
});
