import { existsSync } from 'node:fs';
import type { BrowserWindow, WebContents } from 'electron';
import type { Bounds, WebCommand } from './policy';
import { WebViews } from './web-views';
import { WebView2Views } from './webview2-views';

interface Route {
  native: boolean;
  bounds: Bounds | null;
  owner: BrowserWindow;
  id: string;
}
interface Options {
  appOrigin(): string | null;
  executable: string;
  profile: string;
  diagnostics?: boolean;
  legacy?: boolean;
}

/** Same renderer bridge, with WebView2 on Windows and Electron elsewhere (ADR-0047). */
export class BrowserViews {
  private readonly electron: WebViews;
  private readonly windows: WebView2Views | null;
  private readonly routes = new Map<string, Route>();
  private nativeUnavailable = false;

  constructor(options: Options) {
    this.electron = new WebViews(options.appOrigin);
    this.windows =
      process.platform === 'win32' && !options.legacy && existsSync(options.executable)
        ? new WebView2Views(options)
        : null;
  }
  private key(owner: BrowserWindow, id: string) {
    return `${owner.id}:${id}`;
  }

  async open(owner: BrowserWindow, id: string, url: string): Promise<void> {
    const key = this.key(owner, id);
    const existing = this.routes.get(key);
    if (existing) {
      if (existing.native) await this.windows?.open(owner, id, url);
      else this.electron.open(owner, id, url);
      return;
    }
    const route: Route = {
      native: Boolean(this.windows && !this.nativeUnavailable),
      bounds: null,
      owner,
      id,
    };
    this.routes.set(key, route);
    if (route.native && this.windows) {
      try {
        await this.windows.open(owner, id, url);
        return;
      } catch {
        this.windows.release(owner, id);
        this.nativeUnavailable = true;
        // An unavailable system runtime must not remove ordinary browsing on older Windows.
        if (this.routes.get(key) !== route || owner.isDestroyed()) return;
        route.native = false;
      }
    }
    this.electron.open(owner, id, url);
    this.electron.place(owner, id, route.bounds);
  }

  place(owner: BrowserWindow, id: string, bounds: Bounds | null): void {
    const route = this.routes.get(this.key(owner, id));
    if (!route) return;
    route.bounds = bounds;
    if (route.native) this.windows?.place(owner, id, bounds);
    else this.electron.place(owner, id, bounds);
  }

  async command(
    owner: BrowserWindow,
    id: string,
    command: WebCommand,
    url: string | null,
  ): Promise<void> {
    if (this.routes.get(this.key(owner, id))?.native)
      await this.windows?.command(owner, id, command, url);
    else this.electron.command(owner, id, command, url);
  }

  snapshot(owner: BrowserWindow, id: string): Promise<string | null> {
    return this.routes.get(this.key(owner, id))?.native && this.windows
      ? this.windows.snapshot(owner, id)
      : this.electron.snapshot(owner, id);
  }

  release(owner: BrowserWindow, id: string): void {
    const route = this.routes.get(this.key(owner, id));
    this.routes.delete(this.key(owner, id));
    if (route?.native) this.windows?.release(owner, id);
    else this.electron.release(owner, id);
  }

  releaseAll(owner: BrowserWindow): void {
    for (const route of this.routes.values())
      if (route.owner === owner) this.release(owner, route.id);
  }

  /** Process-internal diagnostics only; not exposed through the preload. */
  inspect(owner: BrowserWindow, id: string) {
    return this.routes.get(this.key(owner, id))?.native ? this.windows?.inspect(owner, id) : null;
  }

  harden(contents: WebContents): void {
    this.electron.harden(contents);
  }
  dispose(): void {
    for (const route of this.routes.values()) this.release(route.owner, route.id);
    this.windows?.dispose();
  }
}
