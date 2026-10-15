import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { electronExecutable, isolatedEnvironment, removeQuietly } from './desktop-harness';
import { createResearchSite } from './desktop-web-site';
import { expectPageTitle } from './titles';

for (const packaged of [false, true]) {
  test(`WebView2 embeds interactive HTTP responses beside notes (${packaged ? 'packaged' : 'source'})`, async () => {
    test.skip(process.platform !== 'win32', 'Windows native browser');
    const executable = packaged
      ? path.join(process.cwd(), 'apps/desktop/release/win32-unpacked/Manuscript.exe')
      : electronExecutable();
    test.skip(!existsSync(executable), 'Run desktop:build for the packaged native regression');
    test.setTimeout(180_000);
    const site = await createResearchSite();
    const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-webview2-'));
    const app = await electron.launch({
      executablePath: executable,
      args: packaged ? [] : [path.join(process.cwd(), 'apps', 'desktop')],
      cwd: process.cwd(),
      env: {
        ...isolatedEnvironment(dir, path.join(dir, 'vault')),
        SKB_WEBVIEW2_DIAGNOSTICS: '1',
        SKB_DEVTOOLS: '1',
      },
    });
    const cdp = (method: string, parameters: Record<string, unknown> = {}) =>
      app.evaluate(
        async ({ app }, command) => {
          const require = process
            .getBuiltinModule('node:module')
            .createRequire(`${app.getAppPath()}/package.json`);
          const driver = require(app.getAppPath()).webViews.windows;
          const entry = [...driver.entries.values()][0] as { key: string };
          return JSON.parse(
            await driver.connection.request('debug', {
              key: entry.key,
              method: command.method,
              parameters: JSON.stringify(command.parameters),
            }),
          );
        },
        { method, parameters },
      );
    const evaluate = async (expression: string) =>
      (await cdp('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    const inspect = () =>
      app.evaluate(async ({ app }) => {
        const require = process
          .getBuiltinModule('node:module')
          .createRequire(`${app.getAppPath()}/package.json`);
        const driver = require(app.getAppPath()).webViews;
        const route = [...driver.routes.values()][0] as {
          owner: Electron.BrowserWindow;
          id: string;
        };
        return (await driver.inspect(route.owner, route.id)) as {
          engine: string;
          visible: boolean;
          bounds: { x: number; y: number; width: number; height: number };
        };
      });
    const click = async (selector: string) => {
      const point = await evaluate(
        `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
      );
      await cdp('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...point,
        button: 'left',
        clickCount: 1,
      });
      await cdp('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...point,
        button: 'left',
        clickCount: 1,
      });
    };
    try {
      const page = await app.firstWindow();
      await expectPageTitle(page, 'Today', { timeout: 90_000 });
      const note = await page.evaluate(async (url) => {
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: 'Native research',
            content: `Reading:\n\n[Research paper](${url}/redirect)\n`,
          }),
        });
        return (await response.json()) as { id: string };
      }, site.origin);
      await page.goto(`${new URL(page.url()).origin}/notes/${note.id}`);
      await page.locator('.cm-content .cm-link[data-href]').click();
      await expect(page.locator('[data-web-page-notice]')).toContainText('HTTP 403', {
        timeout: 45_000,
      });
      expect((await inspect()).engine).toBe('webview2');
      const checkBounds = async () => {
        await expect
          .poll(async () => {
            const box = await page.locator('[data-web-view-host]').boundingBox();
            const native = await inspect();
            return Boolean(
              box &&
                native.visible &&
                Object.entries(native.bounds).every(
                  ([key, value]) => Math.abs(value - box[key as keyof typeof box]) <= 2,
                ),
            );
          })
          .toBe(true);
        const panes = page.locator('[data-editor-pane]');
        const left = await panes.nth(0).boundingBox();
        const right = await panes.nth(1).boundingBox();
        expect(left && right && left.x + left.width <= right.x + 1).toBe(true);
      };
      for (const width of [1400, 1000]) {
        await app.evaluate(
          ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setSize(width, 800),
          width,
        );
        await checkBounds();
      }
      // SDK diagnostics use the private pipe in explicitly enabled test mode; no website bridge exists.
      expect(await evaluate('document.body.textContent')).toContain('Verification fixture');
      const framePoint = await evaluate(
        `(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { x: r.x + 60, y: r.y + 20 }; })()`,
      );
      await cdp('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...framePoint,
        button: 'left',
        clickCount: 1,
      });
      await cdp('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...framePoint,
        button: 'left',
        clickCount: 1,
      });
      await expect.poll(() => evaluate("document.querySelector('#continue').disabled")).toBe(false);
      await click('#popup');
      await expect
        .poll(() => evaluate('window.popupResult'))
        .toEqual({
          kind: 'popup-ready',
          storage: 'remembered',
          cookie: 'researchSession=kept',
          node: 'undefined',
          bridge: 'undefined',
        });
      await evaluate('window.fixturePopup.close(); true');
      expect(
        await evaluate(
          "({ storage: localStorage.getItem('research'), cookie: document.cookie, node: typeof window.require, bridge: typeof window.skbDesktop })",
        ),
      ).toEqual({
        storage: 'remembered',
        cookie: 'researchSession=kept',
        node: 'undefined',
        bridge: 'undefined',
      });
      await click('#continue');
      await expect.poll(() => evaluate('document.body.textContent')).toContain('Research paper');
      await expect(page.locator('[data-web-page-notice]')).toHaveCount(0);
      await page.getByRole('button', { name: 'New note', exact: true }).first().click();
      const dialogue = page.getByRole('dialog', { name: 'New note' });
      await dialogue.getByLabel('Title').fill('Native editing');
      await dialogue.getByRole('button', { name: 'Create note' }).click();
      await page.locator('[data-editor-pane]').first().locator('.cm-content').click();
      await page.keyboard.insertText('Saved beside WebView2.');
      await expect
        .poll(() => {
          const file = path.join(dir, 'vault', 'Native editing.md');
          return existsSync(file) ? readFileSync(file, 'utf8') : '';
        })
        .toContain('Saved beside WebView2.');
      await page.getByRole('treeitem', { name: 'Native research', exact: true }).click();
      await expect(page.locator('.cm-content')).toContainText('Research paper');
      await checkBounds();
      await page.getByLabel('Address', { exact: true }).focus();
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect.poll(async () => (await inspect()).visible).toBe(false);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await inspect()).visible).toBe(true);
      await page.getByRole('button', { name: 'Close Research paper', exact: true }).click();
      await expect(page.locator('[data-web-tab]')).toHaveCount(0);
      await page.locator('.cm-content .cm-link[data-href]').click();
      await expect(page.getByRole('button', { name: 'Research paper', exact: true })).toBeVisible();
      await checkBounds();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Research paper', exact: true })).toBeVisible();
      await checkBounds();
      await click('a');
      await expect.poll(() => evaluate('location.href')).toBe(`${site.origin}/ordinary`);
      await page.getByLabel('Back', { exact: true }).click();
      await expect.poll(() => evaluate('location.href')).toBe(`${site.origin}/paper`);
      await page.getByLabel('Address', { exact: true }).fill(`${site.origin}/unavailable`);
      await page.getByLabel('Address', { exact: true }).press('Enter');
      await expect(page.locator('[data-web-page-notice]')).toContainText('could not', {
        timeout: 30_000,
      });
      await expect(page.getByLabel('Address', { exact: true })).toHaveValue(
        `${site.origin}/unavailable`,
      );
      site.recover();
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect.poll(() => evaluate('document.body.textContent')).toContain('Research paper');
      await expect(page.locator('[data-web-page-notice]')).toHaveCount(0);
    } finally {
      await app.close();
      site.close();
      removeQuietly(dir);
    }
  });
}
