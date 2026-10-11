import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SECTIONS } from '../apps/web/src/app/sections';
import { headingOutline, seriousViolations } from './axe';

/**
 * Task 18.09: the desktop shell, for real. Electron starts the server in a utility process, the
 * window shows the application signed in, the page has the bridge and nothing of Node, a link to the
 * web does not turn the window into a browser, and quitting releases the vault.
 */

const root = process.cwd();

/**
 * The environment a launched application runs in. The user's profile is replaced by a folder of the
 * test's own: whatever a vault or data folder falls back to (the default vault is in Documents), it
 * is inside the test's temporary folder and never the real one.
 */
function isolatedEnvironment(dir: string, vault: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env))
    if (typeof value === 'string' && name !== 'ELECTRON_RUN_AS_NODE') env[name] = value;
  const home = path.join(dir, 'home');
  return Object.assign(env, {
    USERPROFILE: home,
    HOME: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    SKB_VAULT: vault,
    SKB_DATA_DIR: path.join(dir, 'data'),
    SKB_LOG_LEVEL: 'warn',
  });
}

/** Chromium's helper processes can hold a file for a moment after quitting: not worth failing for. */
function removeQuietly(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // The playwright config removes old temporary folders at the start of the next run.
  }
}

function electronExecutable(): string {
  const folder = path.join(root, 'node_modules', 'electron');
  const name = readFileSync(path.join(folder, 'path.txt'), 'utf8').trim();
  const executable = path.join(folder, 'dist', name);
  if (!existsSync(executable))
    throw new Error('Electron is not downloaded: run "node node_modules/electron/install.js".');
  return executable;
}

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
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
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
    await expect(page.getByRole('heading', { level: 1, name: 'Desktop smoke note' })).toBeVisible();
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
    await expect.poll(() => new URL(page.url()).origin, { timeout: 60_000 }).not.toBe(origin);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
      timeout: 60_000,
    });
    const next = await page.evaluate(async () => {
      const response = await fetch('/api/health');
      return (await response.json()) as { vault: { path: string } };
    });
    expect(path.resolve(next.vault.path)).toBe(path.resolve(other));
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
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
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
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
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
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
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
