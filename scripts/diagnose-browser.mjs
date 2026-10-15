// Manual browser compatibility reproduction; never opens Manuscript's server or the user's profile.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
if (process.argv.length > 3)
  throw new Error('Usage: node scripts/diagnose-browser.mjs [electron-executable]');
const executable = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
if (typeof executable !== 'string' || !existsSync(executable))
  throw new Error('Electron is not downloaded. Run node node_modules/electron/install.js first.');
const directory = mkdtempSync(path.join(tmpdir(), 'skb-browser-diagnostic-'));
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
copyFileSync(
  fileURLToPath(new URL('./diagnostic-browser.cjs', import.meta.url)),
  path.join(directory, 'main.cjs'),
);
writeFileSync(
  path.join(directory, 'package.json'),
  JSON.stringify({ name: 'manuscript', version, main: 'main.cjs' }),
);
const profile = path.join(directory, 'home');
const env = {
  ...process.env,
  SKB_DIAGNOSTIC_ROOT: directory,
  USERPROFILE: profile,
  HOME: profile,
  APPDATA: path.join(profile, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
  XDG_CONFIG_HOME: path.join(profile, '.config'),
  SKB_VAULT: path.join(directory, 'vault'),
  SKB_DATA_DIR: path.join(directory, 'data'),
};
delete env.ELECTRON_RUN_AS_NODE;
console.log(`[browser diagnostic] Isolated profile and sanitised events: ${directory}`);
console.log('[browser diagnostic] Complete any checkbox yourself; close the window when finished.');
const child = spawn(executable, [directory], { cwd: root, env, stdio: 'inherit' });
child.on('error', () => {
  console.error('[browser diagnostic] Could not start the selected Electron executable.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
