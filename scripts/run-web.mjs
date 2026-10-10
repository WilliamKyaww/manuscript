// One-click launcher logic used by run-web.bat (and usable on any platform: `node scripts/run-web.mjs`).
//  1. checks the Node.js version;
//  2. installs dependencies when node_modules is missing or out of date;
//  3. rebuilds when sources are newer than the build;
//  4. if the app is already running, just opens it in the browser;
//  5. otherwise starts the server and opens the browser.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'Manuscript';
const MIN_NODE_MAJOR = 24;
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverBundle = path.join(root, 'apps', 'server', 'dist', 'server.mjs');
const bundledIndex = path.join(root, 'apps', 'server', 'dist', 'web', 'index.html');
const port = Number(process.env.SKB_PORT ?? 4317);
// For automated checks: start without opening a browser window.
const openTheBrowser = process.env.SKB_NO_BROWSER !== '1';

const say = (message) => console.log(`[${APP}] ${message}`);
const fail = (message) => {
  console.error(`\n[${APP}] ${message}\n`);
  process.exit(1);
};

function run(command, args) {
  return new Promise((resolve) => {
    // A shell is needed for npm.cmd on Windows. The command line is built only from fixed strings,
    // and passed as one string (passing an args array with shell: true is deprecated, DEP0190).
    const child = spawn([command, ...args].join(' '), { cwd: root, stdio: 'inherit', shell: true });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function newestMtime(target) {
  if (!existsSync(target)) return 0;
  const stats = statSync(target);
  if (!stats.isDirectory()) return stats.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }
  return newest;
}

/**
 * Mirrors defaultDataDir() in apps/server/src/config/config.ts (TD-01), including the fallback to a
 * folder created before the project was renamed (ADR-0027).
 */
function dataDir() {
  if (process.env.SKB_DATA_DIR) return path.resolve(process.env.SKB_DATA_DIR);
  const home = os.homedir();
  const prefer = (base, current, legacy) => {
    const currentPath = path.join(base, current);
    const legacyPath = path.join(base, legacy);
    return !existsSync(currentPath) && existsSync(legacyPath) ? legacyPath : currentPath;
  };
  if (process.platform === 'win32') {
    const base = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return prefer(base, 'Manuscript', 'StudyKnowledgeBase');
  }
  if (process.platform === 'darwin') {
    return prefer(
      path.join(home, 'Library', 'Application Support'),
      'Manuscript',
      'StudyKnowledgeBase',
    );
  }
  return prefer(
    process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'),
    'manuscript',
    'study-knowledge-base',
  );
}

async function alreadyRunning() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = await response.json();
    // Also recognise an instance started before the rename (ADR-0027).
    return body?.app === 'manuscript' || body?.app === 'study-knowledge-base';
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

// 1. Node.js version
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE_MAJOR) {
  fail(
    `Node.js ${MIN_NODE_MAJOR} or newer is required (found ${process.versions.node}). Install it from https://nodejs.org/.`,
  );
}

// 2. Dependencies
const lockFile = path.join(root, 'package-lock.json');
const installedMarker = path.join(root, 'node_modules', '.package-lock.json');
if (!existsSync(installedMarker) || newestMtime(lockFile) > newestMtime(installedMarker)) {
  say('Installing dependencies (first run or after an update)...');
  if ((await run('npm', ['install'])) !== 0)
    fail('Installing dependencies failed. Check your internet connection and try again.');
}

// 3. Build
const sources = [
  'packages/core/src',
  'apps/server/src',
  'apps/web/src',
  'apps/web/public',
  'apps/web/index.html',
  'apps/web/vite.config.ts',
  'scripts/build-server.mjs',
  'package-lock.json',
].map((relative) => path.join(root, relative));
const builtAt =
  existsSync(serverBundle) && existsSync(bundledIndex) ? statSync(serverBundle).mtimeMs : 0;
if (builtAt === 0 || Math.max(...sources.map(newestMtime)) > builtAt) {
  say('Building the application...');
  if ((await run('npm', ['run', 'build'])) !== 0) fail('The build failed. See the messages above.');
}

// 4. Already running?
if (await alreadyRunning()) {
  const tokenFile = path.join(dataDir(), 'auth-token');
  const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';
  const url = token
    ? `http://127.0.0.1:${port}/auth?token=${encodeURIComponent(token)}`
    : `http://127.0.0.1:${port}/`;
  say('Already running - opening it in your browser.');
  if (openTheBrowser) openBrowser(url);
  process.exit(0);
}

// 5. Start. The server exits with 75 when the student asks to open another vault (Settings → Data);
// the vault is chosen at start-up, so it is started again here, without opening another tab.
const RESTART_EXIT_CODE = 75;
const startServer = (first) => {
  const serverArgs = [
    '--enable-source-maps',
    serverBundle,
    ...(openTheBrowser && first ? ['--open'] : []),
    ...process.argv.slice(2),
  ];
  const server = spawn(process.execPath, serverArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SKB_RESTARTABLE: '1' },
  });
  server.on('exit', (code) => {
    if (code === RESTART_EXIT_CODE) {
      say('Opening the other vault...');
      startServer(false);
    } else process.exit(code ?? 0);
  });
  server.on('error', (error) => fail(`Could not start the server: ${error.message}`));
};
say('Starting...');
// Ctrl+C reaches the server directly (same console); just wait for it to finish.
process.on('SIGINT', () => {});
startServer(true);
