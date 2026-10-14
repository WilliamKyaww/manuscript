import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ElectronApplication } from '@playwright/test';

/** Window captures omit native views, so retain both pictures and their measured placement. */
export async function captureWebPane(app: ElectronApplication, name: string): Promise<void> {
  const folder = process.env.SKB_SCREENSHOTS;
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  const pictures = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Missing application window');
    const view = window.contentView.children[0] as Electron.WebContentsView;
    return {
      window: (await window.capturePage()).toPNG().toString('base64'),
      native: (await view.webContents.capturePage()).toPNG().toString('base64'),
      bounds: view.getBounds(),
      visible: view.getVisible(),
    };
  });
  writeFileSync(path.join(folder, `${name}-window.png`), Buffer.from(pictures.window, 'base64'));
  writeFileSync(path.join(folder, `${name}-native.png`), Buffer.from(pictures.native, 'base64'));
  writeFileSync(
    path.join(folder, `${name}-bounds.json`),
    JSON.stringify(
      {
        bounds: pictures.bounds,
        visible: pictures.visible,
      },
      null,
      2,
    ),
  );
}

/** Every fallback location stays inside the test's own temporary directory, even after a vault switch. */
export function isolatedEnvironment(dir: string, vault: string): Record<string, string> {
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

/** Chromium can hold a file briefly after quitting; the next test run also cleans old folders. */
export function removeQuietly(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // The playwright config removes old temporary folders at the start of the next run.
  }
}

export function electronExecutable(): string {
  const folder = path.join(process.cwd(), 'node_modules', 'electron');
  const name = readFileSync(path.join(folder, 'path.txt'), 'utf8').trim();
  const executable = path.join(folder, 'dist', name);
  if (!existsSync(executable))
    throw new Error('Electron is not downloaded: run "node node_modules/electron/install.js".');
  return executable;
}
