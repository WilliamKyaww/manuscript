// Starts an installed (or unpacked) Manuscript with a vault, data folder and profile of its own and
// checks that it comes up signed in, answers its health check and quits cleanly:
//   node scripts/check-installed.mjs "<path to Manuscript.exe>"
// Nothing of the real vault or data folder is used: the user's profile folders are replaced.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const executable = process.argv[2];
if (!executable || !existsSync(executable)) {
  console.error('Usage: node scripts/check-installed.mjs "<path to Manuscript.exe>"');
  process.exit(2);
}

const dir = mkdtempSync(path.join(tmpdir(), 'skb-check-installed-'));
const home = path.join(dir, 'home');
const vault = path.join(dir, 'vault');
const env = {};
for (const [name, value] of Object.entries(process.env))
  if (typeof value === 'string' && name !== 'ELECTRON_RUN_AS_NODE') env[name] = value;
Object.assign(env, {
  USERPROFILE: home,
  HOME: home,
  APPDATA: path.join(home, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  SKB_VAULT: vault,
  SKB_DATA_DIR: path.join(dir, 'data'),
  SKB_LOG_LEVEL: 'warn',
});

let failed = false;
const app = await electron.launch({ executablePath: executable, args: [], cwd: dir, env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 90_000 });
  const packaged = await app.evaluate(({ app: electronApp }) => electronApp.isPackaged);
  const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());
  const health = await page.evaluate(async () => (await fetch('/api/health')).json());
  console.log(
    `OK  ${path.basename(executable)} ${version}: packaged=${packaged}, server ${health.version}, vault ${health.vault.path}`,
  );
  if (
    !packaged ||
    health.status !== 'ok' ||
    path.resolve(health.vault.path) !== path.resolve(vault)
  )
    failed = true;
} catch (error) {
  console.error('FAILED', error);
  failed = true;
} finally {
  await app.close();
}
const lock = path.join(vault, '.skb', 'lock');
for (let i = 0; i < 30 && existsSync(lock); i += 1) await new Promise((r) => setTimeout(r, 500));
if (existsSync(lock)) {
  console.error('FAILED: the vault lock was not released');
  failed = true;
}
try {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Left for the system's temporary folder clean-up.
}
process.exit(failed ? 1 : 0);
