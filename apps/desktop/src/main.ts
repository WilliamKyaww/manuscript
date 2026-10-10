import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
} from 'electron';
import { defaultDataDir } from '../../server/src/config/config';
import { type Engine, RESTART_EXIT_CODE, startEngine } from './engine';
import { buildMenu } from './menu';
import {
  externalUrl,
  isAppUrl,
  isRevealable,
  restoreWindowState,
  sanitisePick,
  senderAllowed,
  type WindowState,
} from './policy';
import { loadSecretsKey, type SecretsKey } from './secrets';

/**
 * The desktop shell (Phase 18, ADR-0016): one window onto the same server `npm start` runs, kept in
 * a utility process. It adds only what a web page cannot do — native pickers, showing a file in its
 * folder, the operating system's protection for AI keys, a window that remembers where it was —
 * and refuses to be anything else: the window shows no address but the server's, and links to the
 * web open in the system browser.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const developing = !app.isPackaged;
const devTools = developing || process.env.SKB_DEVTOOLS === '1';

app.setName('Manuscript');
if (process.platform === 'win32') app.setAppUserModelId('app.manuscript.desktop');

// Everything Electron keeps for its own use (caches, local storage) lives beside the application's
// data and not in the vault, and not in a profile of its own that tests would have to clean up.
const dataDir = path.resolve(
  process.env.SKB_DATA_DIR ??
    defaultDataDir(process.platform, process.env, os.homedir(), existsSync),
);
mkdirSync(dataDir, { recursive: true });
app.setPath('userData', path.join(dataDir, 'desktop'));

const serverPath = () =>
  process.env.SKB_SERVER_BUNDLE ??
  (app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'server.mjs')
    : path.resolve(here, '..', '..', 'server', 'dist', 'server.mjs'));

let engine: Engine | null = null;
let window: BrowserWindow | null = null;
let secrets: SecretsKey = { key: null, protection: 'file' };
let folders: { vault: string | null; data: string | null } = { vault: null, data: dataDir };
let quitting = false;
let stopped = false;
/**
 * `SKB_VAULT` in the environment (a developer's or a test's choice of vault) holds until the student
 * chooses another vault in the application; after that the choice they made is the one that counts.
 */
let vaultOverride = true;
/** The token the server accepts, made for this run: nothing else on the machine knows it. */
const token = randomBytes(32).toString('base64url');

// --- Window state -------------------------------------------------------------------------------

const stateFile = () => path.join(dataDir, 'window-state.json');

function readState(): WindowState {
  let saved: unknown = null;
  try {
    saved = JSON.parse(readFileSync(stateFile(), 'utf8'));
  } catch {
    // No saved state yet.
  }
  return restoreWindowState(
    saved,
    screen.getAllDisplays().map((display) => display.workArea),
  );
}

function writeState(target: BrowserWindow): void {
  if (target.isDestroyed() || target.isMinimized() || target.isFullScreen()) return;
  const maximised = target.isMaximized();
  const bounds = maximised ? target.getNormalBounds() : target.getBounds();
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximised }));
  } catch {
    // Not being able to remember where the window was is not worth a message.
  }
}

// --- The server ---------------------------------------------------------------------------------

function engineEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env))
    if (typeof value === 'string' && name !== 'ELECTRON_RUN_AS_NODE') env[name] = value;
  env.SKB_AUTH_TOKEN = token;
  env.SKB_RESTARTABLE = '1';
  env.SKB_NO_BROWSER = '1';
  env.SKB_DATA_DIR = dataDir;
  if (!vaultOverride) delete env.SKB_VAULT;
  if (secrets.key) env.SKB_SECRETS_KEY = secrets.key;
  else delete env.SKB_SECRETS_KEY;
  return env;
}

async function startServer(): Promise<Engine> {
  const started = await startEngine({
    serverPath: serverPath(),
    env: engineEnvironment(),
    onOutput: (line, stream) =>
      (stream === 'stderr' ? console.error : console.warn)(`[engine] ${line}`),
  });
  engine = started;
  // The page is signed in before it loads: the cookie the server expects, for its own origin.
  await session.defaultSession.cookies.set({
    url: started.origin,
    name: `skb_session_${started.port}`,
    value: token,
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
  try {
    const response = await fetch(`${started.origin}/api/health`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const health = (await response.json()) as { vault?: { path?: string } };
    folders = { vault: health.vault?.path ?? null, data: dataDir };
  } catch {
    folders = { vault: null, data: dataDir };
  }
  void started.exited.then((code) => void onEngineExit(started, code));
  return started;
}

async function onEngineExit(which: Engine, code: number): Promise<void> {
  if (quitting || engine !== which) return;
  engine = null;
  if (code === RESTART_EXIT_CODE) {
    // Another vault was chosen: the engine opens it at start-up, so start it again.
    vaultOverride = false;
    try {
      const next = await startServer();
      if (window && !window.isDestroyed()) await window.loadURL(`${next.origin}/`);
      return;
    } catch (error) {
      await failed(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  await failed(`The engine stopped unexpectedly (code ${code}).`);
}

async function failed(detail: string): Promise<void> {
  if (quitting) return;
  const answer = await dialog.showMessageBox({
    type: 'error',
    title: 'Manuscript',
    message: 'Manuscript’s engine is not running.',
    detail: `${detail}\n\nYour notes and data are safe: they are files and a database on disk.`,
    buttons: ['Start it again', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  if (answer.response === 0) {
    try {
      const next = await startServer();
      if (window && !window.isDestroyed()) await window.loadURL(`${next.origin}/`);
      else openWindow(next);
      return;
    } catch (error) {
      await failed(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  app.quit();
}

// --- The window ---------------------------------------------------------------------------------

function openWindow(running: Engine): void {
  const state = readState();
  const created = new BrowserWindow({
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Manuscript',
    backgroundColor: '#f7f5f0',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools,
    },
  });
  window = created;
  created.once('ready-to-show', () => {
    if (state.maximised) created.maximize();
    created.show();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remember = () => {
    clearTimeout(timer);
    timer = setTimeout(() => writeState(created), 400);
  };
  created.on('resize', remember);
  created.on('move', remember);
  created.on('close', () => writeState(created));
  created.on('closed', () => {
    window = null;
  });
  void created.loadURL(`${running.origin}/`);
}

/** Rules for every page this process ever shows (also the pages other pages might open). */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    const guard = (event: { preventDefault(): void }, url: string) => {
      if (engine && isAppUrl(url, engine.origin)) return;
      event.preventDefault();
      const outside = externalUrl(url);
      if (outside) void shell.openExternal(outside);
    };
    contents.on('will-navigate', (event, url) => guard(event, url));
    contents.on('will-redirect', (event, url) => guard(event, url));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      const outside = externalUrl(url);
      if (outside) void shell.openExternal(outside);
      return { action: 'deny' };
    });
  });
  // A page asks for nothing it does not need: writing to the clipboard and full screen, no more.
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(allowed.has(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowed.has(permission),
  );
}

// --- The bridge ---------------------------------------------------------------------------------

function registerBridge(): void {
  const trusted = (event: IpcMainInvokeEvent) =>
    senderAllowed(event.senderFrame?.url, engine?.origin ?? null);

  ipcMain.handle('skb:pick-files', async (event, options: unknown) => {
    if (!trusted(event) || !window) return [];
    const wanted = sanitisePick(options);
    const result = await dialog.showOpenDialog(window, {
      ...(wanted.title ? { title: wanted.title } : {}),
      ...(wanted.filters ? { filters: wanted.filters } : {}),
      properties: ['openFile', ...(wanted.multiple ? (['multiSelections'] as const) : [])],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('skb:pick-folder', async (event, options: unknown) => {
    if (!trusted(event) || !window) return null;
    const wanted = sanitisePick(options);
    const result = await dialog.showOpenDialog(window, {
      ...(wanted.title ? { title: wanted.title } : {}),
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('skb:reveal', (event, target: unknown) => {
    if (!trusted(event)) return false;
    const roots = [folders.vault, folders.data].filter((root): root is string => root !== null);
    if (!isRevealable(target, roots)) return false;
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('skb:app-info', (event) => {
    if (!trusted(event)) return null;
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: `${process.platform} ${process.arch}`,
      secrets: secrets.protection,
    };
  });
}

// --- Life cycle ---------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  // Another copy owns the vault: bring its window forward instead of fighting over the lock.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on('before-quit', (event) => {
    if (stopped) return;
    event.preventDefault();
    quitting = true;
    const running = engine;
    void (running ? running.stop() : Promise.resolve(0)).finally(() => {
      stopped = true;
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(async () => {
    hardenWebContents();
    registerBridge();
    Menu.setApplicationMenu(buildMenu({ folders: () => folders, devTools }));
    secrets = loadSecretsKey(dataDir);
    try {
      openWindow(await startServer());
    } catch (error) {
      await failed(error instanceof Error ? error.message : String(error));
    }
  });
}
