import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import {
  captureWebPane,
  electronExecutable,
  isolatedEnvironment,
  removeQuietly,
} from './desktop-harness';
import { createResearchSite } from './desktop-web-site';
import { expectPageTitle } from './titles';

test('HTTP error documents stay interactive; browser sessions, pop-ups and failure recovery work', async () => {
  test.setTimeout(180_000);
  const site = await createResearchSite();
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-desktop-verification-'));
  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [path.join(process.cwd(), 'apps', 'desktop')],
    cwd: process.cwd(),
    env: isolatedEnvironment(dir, path.join(dir, 'vault')),
  });
  const inPage = (code: string) =>
    app.evaluate(async ({ BrowserWindow }, script) => {
      const view = BrowserWindow.getAllWindows().find(
        (window) => window.contentView.children.length > 0,
      )?.contentView.children[0] as Electron.WebContentsView;
      return view.webContents.executeJavaScript(script);
    }, code);
  const visible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.contentView.children.length > 0)
        ?.contentView.children[0]?.getVisible(),
    );
  const click = (selector: string, inFrame = false) =>
    app.evaluate(
      async ({ BrowserWindow }, target) => {
        const view = BrowserWindow.getAllWindows().find(
          (window) => window.contentView.children.length > 0,
        )?.contentView.children[0] as Electron.WebContentsView;
        const contents = view.webContents;
        const frame = target.inFrame ? contents.mainFrame.frames[0] : contents.mainFrame;
        const point = (await frame?.executeJavaScript(`(() => {
      const box = document.querySelector(${JSON.stringify(target.selector)}).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })()`)) as { x: number; y: number };
        if (target.inFrame) {
          const offset = (await contents.executeJavaScript(`(() => {
        const frame = document.querySelector('iframe');
        const box = frame.getBoundingClientRect();
        return { x: box.x + frame.clientLeft, y: box.y + frame.clientTop };
      })()`)) as { x: number; y: number };
          point.x += offset.x;
          point.y += offset.y;
        }
        contents.sendInputEvent({
          type: 'mouseDown',
          button: 'left',
          clickCount: 1,
          x: Math.round(point.x),
          y: Math.round(point.y),
        });
        contents.sendInputEvent({
          type: 'mouseUp',
          button: 'left',
          clickCount: 1,
          x: Math.round(point.x),
          y: Math.round(point.y),
        });
      },
      { selector, inFrame },
    );
  try {
    const page = await app.firstWindow();
    await expectPageTitle(page, 'Today', { timeout: 90_000 });
    const note = await page.evaluate(async (url) => {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Research',
          content: `Reading:\n\n[Research paper](${url}/redirect)\n`,
        }),
      });
      return (await response.json()) as { id: string };
    }, site.origin);
    await page.goto(`${new URL(page.url()).origin}/notes/${note.id}`);
    await page.locator('.cm-content .cm-link[data-href]').click();
    const notice = page.locator('[data-web-page-notice]');
    await expect(notice).toContainText('HTTP 403', { timeout: 30_000 });
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue(`${site.origin}/paper`);
    await expect.poll(visible).toBe(true);
    expect(await inPage('document.body.textContent')).toContain('Verification fixture');
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        await seriousViolations(page, { include: '[data-web-tab]', inPageOnly: true }),
      ).toEqual([]);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await captureWebPane(app, `web-verification-${theme}`);
    }

    // A real native mouse event reaches a separate-origin frame, whose JavaScript reaches its parent.
    await click('#confirm', true);
    await expect.poll(() => inPage("document.querySelector('#continue').disabled")).toBe(false);
    const popupOpened = app.waitForEvent('window');
    await click('#popup');
    const popup = await popupOpened;
    await expect(popup.getByRole('heading', { name: 'Local sign-in window' })).toBeVisible();
    expect(
      await popup.evaluate(() => ({
        cookie: document.cookie,
        storage: localStorage.getItem('research'),
        node: typeof (window as unknown as { require?: unknown }).require,
        bridge: typeof (window as unknown as { skbDesktop?: unknown }).skbDesktop,
      })),
    ).toEqual({
      cookie: 'researchSession=kept',
      storage: 'remembered',
      node: 'undefined',
      bridge: 'undefined',
    });
    expect(
      await app.evaluate(({ BrowserWindow }) => {
        const child = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().endsWith('/popup'),
        );
        if (!child) throw new Error('The popup window was not created');
        // Electron exposes the effective preferences internally; inspect them only in this test.
        const prefs = (
          child.webContents as unknown as {
            getLastWebPreferences(): Electron.WebPreferences;
          }
        ).getLastWebPreferences();
        return {
          sandbox: prefs?.sandbox,
          isolation: prefs?.contextIsolation,
          node: prefs?.nodeIntegration,
          security: prefs?.webSecurity,
        };
      }),
    ).toEqual({ sandbox: true, isolation: true, node: false, security: true });
    await popup.close();

    // Native keyboard activation follows the site's own redirect and retains its ordinary cookie.
    await inPage("document.querySelector('#continue').focus(); 1");
    await app.evaluate(({ BrowserWindow }) => {
      const owner = BrowserWindow.getAllWindows().find(
        (window) => window.contentView.children.length > 0,
      );
      owner?.focus();
      const view = owner?.contentView.children[0] as Electron.WebContentsView;
      view.webContents.focus();
      view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      view.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    });
    await expect(notice).toHaveCount(0);
    await expect.poll(() => inPage('document.title')).toBe('Research paper');
    expect(await inPage('document.cookie')).toContain('paperAccess=yes');
    expect(await inPage("localStorage.getItem('research')")).toBe('remembered');
    await click('a');
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue(
      `${site.origin}/ordinary`,
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue(`${site.origin}/paper`);

    // A broken connection gets a recoverable application notice and preserves the attempted URL.
    const address = page.getByLabel('Address', { exact: true });
    await address.fill(`${site.origin}/unavailable`);
    await address.press('Enter');
    await expect(notice).toContainText('could not be loaded');
    await expect(address).toHaveValue(`${site.origin}/unavailable`);
    await expect.poll(visible).toBe(false);
    // Observe the OS handoff without opening the user's actual browser during a test.
    await app.evaluate(({ shell }) => {
      const calls: string[] = [];
      (globalThis as unknown as { externalCalls: string[] }).externalCalls = calls;
      shell.openExternal = async (url) => {
        calls.push(url);
      };
    });
    await notice.getByRole('button', { name: 'Open in system browser' }).click();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as unknown as { externalCalls: string[] }).externalCalls),
      )
      .toEqual([`${site.origin}/unavailable`]);
    site.recover();
    await notice.getByRole('button', { name: 'Try again' }).click();
    await expect(notice).toHaveCount(0);
    await expect.poll(visible).toBe(true);
    await expect.poll(() => inPage('document.title')).toBe('Research paper');
  } finally {
    await app.close();
    site.close();
    removeQuietly(dir);
  }
});
