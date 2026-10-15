// A secure minimal reproduction for upstream reports, not an alternate production browser.
const { app, BrowserWindow, session } = require('electron');
const { appendFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const root = process.env.SKB_DIAGNOSTIC_ROOT;
if (!root || !path.isAbsolute(root) || !existsSync(root))
  throw new Error('Start this diagnostic with scripts/diagnose-browser.mjs.');
const record = (event) =>
  appendFileSync(
    path.join(root, 'events.jsonl'),
    `${JSON.stringify({
      time: new Date().toISOString(),
      ...event,
    })}\n`,
  );
app.setName('Manuscript');
app.setPath('userData', path.join(root, 'profile'));

app.whenReady().then(() => {
  const web = session.fromPartition('persist:web');
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write']);
  web.setPermissionRequestHandler((_contents, permission, callback) => {
    record({ event: 'permission-request', permission, allowed: allowed.has(permission) });
    callback(allowed.has(permission));
  });
  web.setPermissionCheckHandler((_contents, permission) => {
    record({ event: 'permission-check', permission, allowed: allowed.has(permission) });
    return allowed.has(permission);
  });
  const window = new BrowserWindow({
    width: 1000,
    height: 850,
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:web',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    },
  });
  const title = `Minimal secure Electron ${process.versions.electron} — browser comparison`;
  window.setTitle(title);
  window.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(title);
  });
  const contents = window.webContents;
  const guard = (event, url) => {
    try {
      if (new URL(url).protocol !== 'https:') event.preventDefault();
    } catch {
      event.preventDefault();
    }
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  web.webRequest.onCompleted((details) => {
    const origin = new URL(details.url).origin;
    if (details.resourceType === 'mainFrame' || origin === 'https://challenges.cloudflare.com')
      record({
        event: 'response',
        origin,
        type: details.resourceType,
        status: details.statusCode,
        fromCache: details.fromCache,
      });
  });
  web.cookies.on('changed', (_event, cookie, cause, removed) => {
    if (cookie.name === 'cf_clearance')
      record({ event: 'clearance-cookie', domain: cookie.domain, cause, removed });
  });
  record({
    event: 'started',
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    userAgent: contents.getUserAgent(),
    automation: app.commandLine.hasSwitch('enable-automation'),
    remoteDebugging: app.commandLine.hasSwitch('remote-debugging-port'),
  });
  void contents
    .loadURL('https://debug.challenges.cloudflare.com/')
    .catch(() => record({ event: 'load-failed' }));
  // A developer can stop only this disposable instance by creating this file in the printed folder.
  const timer = setInterval(() => {
    if (existsSync(path.join(root, 'stop'))) app.quit();
  }, 1000);
  timer.unref();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => record({ event: 'closed' }));
