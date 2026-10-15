import type { BrowserWindow } from 'electron';
import type { Bounds, WebCommand } from './policy';
import { WebView2Client } from './webview2-client';
import {
  NativeInspection,
  type NativeMessage,
  NativePicture,
  type NativeState,
} from './webview2-protocol';

interface Connection {
  start(): Promise<boolean>;
  request(operation: string, fields: Record<string, unknown>): Promise<unknown>;
  dispose(): void;
}
interface Options {
  executable: string;
  profile: string;
  appOrigin(): string | null;
  diagnostics?: boolean;
  connection?: (event: (message: NativeMessage) => void, failed: () => void) => Connection;
}
interface Entry {
  key: string;
  id: string;
  owner: BrowserWindow;
  url: string;
  bounds: Bounds | null;
  covered: boolean;
  used: number;
  opened: boolean;
  opening: Promise<void> | null;
  state: NativeState;
}

/** Native Windows child surfaces; external pages cannot see the private helper pipe. */
export class WebView2Views {
  private readonly entries = new Map<string, Entry>();
  private readonly native = new Map<string, Entry>();
  private readonly owners = new Set<number>();
  private readonly suspended = new Set<number>();
  private readonly connection: Connection;
  private sequence = 0;
  private clock = 0;

  constructor(private readonly options: Options) {
    const event = (message: NativeMessage) => this.receive(message);
    const failed = () => {
      for (const entry of this.entries.values()) {
        const wasOpen = entry.opened;
        entry.opened = false;
        entry.opening = null;
        if (wasOpen) this.issue(entry, 'crash', -1);
      }
    };
    this.connection =
      options.connection?.(event, failed) ??
      new WebView2Client({ ...options, onEvent: event, onFailure: failed });
  }

  private identity(owner: BrowserWindow, id: string) {
    return `${owner.id}:${id}`;
  }

  async open(owner: BrowserWindow, id: string, url: string): Promise<void> {
    const identity = this.identity(owner, id);
    let entry = this.entries.get(identity);
    if (!entry) {
      const key = `view-${++this.sequence}`;
      entry = {
        key,
        id,
        owner,
        url,
        bounds: null,
        covered: false,
        used: ++this.clock,
        opened: false,
        opening: null,
        state: {
          type: 'state',
          key,
          url,
          title: '',
          loading: true,
          canGoBack: false,
          canGoForward: false,
          issue: null,
        },
      };
      this.entries.set(identity, entry);
      this.native.set(key, entry);
      this.watch(owner);
    }
    if (entry.opened) return;
    if (entry.opening) return entry.opening;
    const current = entry;
    current.opening = (async () => {
      if (!(await this.connection.start()))
        throw new Error('Microsoft Edge WebView2 is unavailable.');
      const handle = owner.getNativeWindowHandle();
      const parent = (
        handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())
      ).toString();
      await this.connection.request('open', {
        key: current.key,
        parent,
        origin: this.options.appOrigin(),
        url: current.url,
      });
      if (this.entries.get(identity) !== current || owner.isDestroyed()) {
        await this.connection.request('release', { key: current.key });
        return;
      }
      current.opened = true;
      this.placeEntry(current);
      this.trim(owner);
    })();
    try {
      await current.opening;
    } finally {
      current.opening = null;
    }
  }

  place(owner: BrowserWindow, id: string, bounds: Bounds | null): void {
    const entry = this.entries.get(this.identity(owner, id));
    if (!entry) return;
    entry.bounds = bounds;
    entry.covered = false;
    if (bounds) entry.used = ++this.clock;
    this.placeEntry(entry);
  }

  private placeEntry(entry: Entry): void {
    if (!entry.opened) return;
    const bounds = entry.covered || this.suspended.has(entry.owner.id) ? null : entry.bounds;
    void this.connection
      .request('place', { key: entry.key, bounds })
      .catch(() => this.issue(entry, 'load', -2));
  }

  async command(
    owner: BrowserWindow,
    id: string,
    command: WebCommand,
    url: string | null,
  ): Promise<void> {
    const entry = this.entries.get(this.identity(owner, id));
    if (!entry) return;
    if (!entry.opened) {
      if (url) entry.url = url;
      await this.open(owner, id, entry.url);
      if (command === 'load' || command === 'reload') return;
    }
    await this.connection.request('command', { key: entry.key, command, url });
  }

  async snapshot(owner: BrowserWindow, id: string): Promise<string | null> {
    const entry = this.entries.get(this.identity(owner, id));
    if (!entry) return null;
    entry.covered = true;
    if (!entry.opened) return null;
    try {
      return NativePicture.parse(await this.connection.request('snapshot', { key: entry.key }));
    } catch {
      this.placeEntry(entry);
      return null;
    }
  }

  release(owner: BrowserWindow, id: string): void {
    const identity = this.identity(owner, id);
    const entry = this.entries.get(identity);
    if (!entry) return;
    this.entries.delete(identity);
    this.native.delete(entry.key);
    if (entry.opened)
      void this.connection.request('release', { key: entry.key }).catch(() => undefined);
    // An in-flight open releases its own unique key when it completes; it cannot release a newer tab.
  }

  releaseAll(owner: BrowserWindow): void {
    for (const entry of this.entries.values())
      if (entry.owner === owner) this.release(owner, entry.id);
  }

  async inspect(owner: BrowserWindow, id: string) {
    const entry = this.entries.get(this.identity(owner, id));
    if (!entry?.opened) return null;
    return {
      engine: 'webview2' as const,
      ...NativeInspection.parse(await this.connection.request('inspect', { key: entry.key })),
    };
  }

  private receive(message: NativeMessage): void {
    if (message.type !== 'state' && message.type !== 'focus-app') return;
    const entry = this.native.get(message.key);
    if (!entry || entry.owner.isDestroyed()) return;
    if (message.type === 'focus-app') {
      entry.owner.webContents.focus();
      const modifiers: 'shift'[] = message.reverse ? ['shift'] : [];
      entry.owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers });
      entry.owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers });
      return;
    }
    entry.url = message.url;
    entry.state = message;
    this.send(entry);
  }

  private send(entry: Entry): void {
    if (entry.owner.isDestroyed() || !this.native.has(entry.key)) return;
    const { url, title, loading, canGoBack, canGoForward, issue, focused } = entry.state;
    entry.owner.webContents.send('skb:web-state', {
      id: entry.id,
      url,
      title,
      loading,
      canGoBack,
      canGoForward,
      issue,
      focused,
    });
  }

  private issue(entry: Entry, kind: 'load' | 'crash', code: number): void {
    entry.state = { ...entry.state, url: entry.url, loading: false, issue: { kind, code } };
    this.send(entry);
  }

  private trim(owner: BrowserWindow): void {
    const mine = [...this.entries.values()].filter((entry) => entry.owner === owner);
    const spare = mine.filter((entry) => entry.bounds === null).sort((a, b) => a.used - b.used);
    for (const entry of spare.slice(0, Math.max(0, mine.length - 6))) this.release(owner, entry.id);
  }

  private watch(owner: BrowserWindow): void {
    if (this.owners.has(owner.id)) return;
    this.owners.add(owner.id);
    const refresh = () => {
      for (const entry of this.entries.values()) if (entry.owner === owner) this.placeEntry(entry);
    };
    owner.on('move', refresh);
    owner.on('resize', refresh);
    const suspend = () => {
      this.suspended.add(owner.id);
      refresh();
    };
    const resume = () => {
      this.suspended.delete(owner.id);
      refresh();
    };
    owner.on('minimize', suspend);
    owner.on('hide', suspend);
    owner.on('restore', resume);
    owner.on('show', resume);
    owner.on('closed', () => {
      this.releaseAll(owner);
      this.owners.delete(owner.id);
      this.suspended.delete(owner.id);
    });
  }

  dispose(): void {
    this.entries.clear();
    this.native.clear();
    this.connection.dispose();
  }
}
