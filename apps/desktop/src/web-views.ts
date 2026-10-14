import {
  type BrowserWindow,
  clipboard,
  Menu,
  type MenuItemConstructorOptions,
  type Session,
  session,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
import { type Bounds, externalUrl, type WebCommand, webPageUrl } from './policy';
import { type WebLoadIssue, type WebLoadState, watchWebLoad } from './web-load';

/**
 * Web pages beside a note (Phase 26, ADR-0045). A web tab of the page is a native view laid over the
 * place the page keeps for it, so that sites which refuse to be framed still show. Each view runs in a
 * session of its own (`persist:web`): it never sees the application's cookie or token, has no preload
 * and no Node, asks for no permissions, and may only show pages on the web. Hidden views are kept for a
 * few tabs so that switching back keeps the page where it was; the least recently used go first.
 */

const PARTITION = 'persist:web';
/** Views kept per window, shown or hidden. */
const MAX_VIEWS = 6;
const STATE_CHANNEL = 'skb:web-state';

export interface WebViewState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  issue: WebLoadIssue | null;
  /** Set when the page took the keyboard (the student clicked into it). */
  focused?: boolean;
}

interface Entry extends WebLoadState {
  id: string;
  owner: BrowserWindow;
  view: WebContentsView;
  used: number;
}

export function webSession(): Session {
  return session.fromPartition(PARTITION);
}

/** Permissions for the pane's session, once at start-up. Chromium keeps its native identity. */
export function configureWebSession(): void {
  const web = webSession();
  // Full screen for videos and writing to the clipboard; no camera, microphone, location or the rest.
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write']);
  web.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(allowed.has(permission)),
  );
  web.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
}

export class WebViews {
  private readonly entries = new Map<string, Entry>();
  private clock = 0;

  constructor(private readonly appOrigin: () => string | null) {}

  private key(owner: BrowserWindow, id: string): string {
    return `${owner.id}:${id}`;
  }

  /** Shows the tab's page, making its view the first time (or again after it was let go). */
  open(owner: BrowserWindow, id: string, url: string): void {
    const key = this.key(owner, id);
    const existing = this.entries.get(key);
    if (existing) {
      existing.used = ++this.clock;
      return;
    }
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: false,
      },
    });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    owner.contentView.addChildView(view);
    const entry: Entry = { id, owner, view, used: ++this.clock, url, issue: null };
    this.entries.set(key, entry);
    this.watch(entry);
    void view.webContents.loadURL(url).catch(() => {
      // did-fail-load reports this to the toolbar while preserving the requested address.
    });
    this.trim(owner);
  }

  /** Lays the view over the place the page keeps for it, or hides it (null). */
  place(owner: BrowserWindow, id: string, bounds: Bounds | null): void {
    const entry = this.entries.get(this.key(owner, id));
    if (!entry) return;
    if (bounds === null || bounds.width === 0 || bounds.height === 0) {
      entry.view.setVisible(false);
      return;
    }
    entry.view.setBounds(bounds);
    entry.view.setVisible(true);
    entry.used = ++this.clock;
  }

  command(owner: BrowserWindow, id: string, command: WebCommand, url: string | null): void {
    const entry = this.entries.get(this.key(owner, id));
    if (!entry) return;
    const contents = entry.view.webContents;
    const history = contents.navigationHistory;
    if (command === 'back' && history.canGoBack()) history.goBack();
    else if (command === 'forward' && history.canGoForward()) history.goForward();
    else if (command === 'reload') contents.reload();
    else if (command === 'stop') contents.stop();
    else if (command === 'load' && url) void contents.loadURL(url).catch(() => undefined);
  }

  /** A picture of the page (shown by the page while a menu or dialogue covers it); the view hides. */
  async snapshot(owner: BrowserWindow, id: string): Promise<string | null> {
    const entry = this.entries.get(this.key(owner, id));
    if (!entry) return null;
    try {
      const image = await entry.view.webContents.capturePage();
      entry.view.setVisible(false);
      return image.isEmpty()
        ? null
        : `data:image/jpeg;base64,${image.toJPEG(82).toString('base64')}`;
    } catch {
      entry.view.setVisible(false);
      return null;
    }
  }

  release(owner: BrowserWindow, id: string): void {
    const key = this.key(owner, id);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.destroy(entry);
  }

  /** Every view of a window (it reloaded, closed, or its page crashed). */
  releaseAll(owner: BrowserWindow): void {
    for (const [key, entry] of this.entries)
      if (entry.owner === owner) {
        this.entries.delete(key);
        this.destroy(entry);
      }
  }

  private destroy(entry: Entry): void {
    if (!entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
  }

  /** Lets the least recently used hidden views go when a window has too many. */
  private trim(owner: BrowserWindow): void {
    const mine = [...this.entries.values()].filter((entry) => entry.owner === owner);
    if (mine.length <= MAX_VIEWS) return;
    const spare = mine
      .filter((entry) => !entry.view.getVisible())
      .sort((a, b) => a.used - b.used)
      .slice(0, mine.length - MAX_VIEWS);
    for (const entry of spare) this.release(owner, entry.id);
  }

  private send(entry: Entry, extra: Partial<WebViewState> = {}): void {
    const contents = entry.view.webContents;
    if (entry.owner.isDestroyed() || contents.isDestroyed()) return;
    const state: WebViewState = {
      id: entry.id,
      url: entry.url,
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      issue: entry.issue,
      ...extra,
    };
    entry.owner.webContents.send(STATE_CHANNEL, state);
  }

  private watch(entry: Entry): void {
    const contents = entry.view.webContents;
    const update = () => this.send(entry);
    watchWebLoad(contents, entry, update, this.appOrigin);
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);
    contents.on('page-title-updated', update);
    contents.on('focus', () => this.send(entry, { focused: true }));
    contents.on('context-menu', (_event, params) => this.contextMenu(entry, params));
  }

  /** The pane's right-click menu: what a browser offers, and opening outside. */
  private contextMenu(entry: Entry, params: Electron.ContextMenuParams): void {
    const contents = entry.view.webContents;
    const history = contents.navigationHistory;
    const link = params.linkURL ? externalUrl(params.linkURL) : null;
    const template: MenuItemConstructorOptions[] = [];
    if (link)
      template.push(
        { label: 'Open link in browser', click: () => void shell.openExternal(link) },
        { label: 'Copy link address', click: () => clipboard.writeText(link) },
        { type: 'separator' },
      );
    if (params.isEditable)
      template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' });
    else if (params.selectionText) template.push({ role: 'copy' }, { type: 'separator' });
    template.push(
      { label: 'Back', enabled: history.canGoBack(), click: () => history.goBack() },
      { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() },
      { label: 'Reload', click: () => contents.reload() },
      { type: 'separator' },
      {
        label: 'Open page in browser',
        click: () => {
          const page = externalUrl(contents.getURL());
          if (page) void shell.openExternal(page);
        },
      },
    );
    Menu.buildFromTemplate(template).popup({ window: entry.owner });
  }

  /**
   * The rules for every page shown in the pane, and for the pop-ups such a page opens (sign-in
   * windows): web addresses only, never the application; a link meant for a new tab opens in the same
   * pane; no `<webview>`.
   */
  harden(contents: WebContents): void {
    const guard = (event: { preventDefault(): void }, url: string) => {
      if (!webPageUrl(url, this.appOrigin())) event.preventDefault();
    };
    contents.on('will-navigate', (event, url) => guard(event, url));
    contents.on('will-redirect', (event, url) => guard(event, url));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url, disposition }) => {
      const page = webPageUrl(url, this.appOrigin());
      if (!page) return { action: 'deny' };
      // A pop-up asked for by the page (a sign-in window) is a window; a link to a new tab stays here.
      if (disposition === 'new-window')
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            autoHideMenuBar: true,
            webPreferences: {
              partition: PARTITION,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              devTools: false,
            },
          },
        };
      void contents.loadURL(page).catch(() => undefined);
      return { action: 'deny' };
    });
  }
}
