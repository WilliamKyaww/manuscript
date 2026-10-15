import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { NativeMessage } from './webview2-protocol';
import { WebView2Views } from './webview2-views';

const url = 'https://example.org/paper';
const bounds = { x: 500, y: 100, width: 500, height: 600 };
function fixture(delayed = false) {
  let emit: (message: NativeMessage) => void = () => undefined;
  let failed: () => void = () => undefined;
  const waits = new Map<string, (value: unknown) => void>();
  const request = vi.fn((operation: string, fields: Record<string, unknown>): Promise<unknown> => {
    if (operation === 'open' && delayed)
      return new Promise((resolve) => waits.set(String(fields.key), resolve));
    return Promise.resolve(operation === 'snapshot' ? 'data:image/png;base64,AA==' : null);
  });
  const send = vi.fn();
  const events = new EventEmitter();
  // The owner fixture exposes only the native handle, lifecycle events and private state channel.
  const owner = Object.assign(events, {
    id: 1,
    isDestroyed: () => false,
    getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
    webContents: { send, focus: vi.fn(), sendInputEvent: vi.fn() },
  }) as unknown as BrowserWindow;
  const driver = new WebView2Views({
    executable: 'unused',
    profile: 'unused',
    appOrigin: () => 'http://127.0.0.1:4317',
    connection: (onEvent, onFailure) => {
      emit = onEvent;
      failed = onFailure;
      return { start: async () => true, request, dispose: vi.fn() };
    },
  });
  return {
    driver,
    owner,
    events,
    request,
    send,
    emit: (message: NativeMessage) => emit(message),
    fail: () => failed(),
    finish: (key: string) => waits.get(key)?.(true),
  };
}
const state = (key: string, address = url): NativeMessage => ({
  type: 'state',
  key,
  url: address,
  title: 'Paper',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  issue: null,
});

describe('native browser lifecycle', () => {
  it('keeps the latest bounds while the native controller is being created', async () => {
    const f = fixture(true);
    const opening = f.driver.open(f.owner, 'paper', url);
    f.driver.place(f.owner, 'paper', bounds);
    await vi.waitFor(() =>
      expect(f.request).toHaveBeenCalledWith('open', expect.objectContaining({ key: 'view-1' })),
    );
    expect(f.request).not.toHaveBeenCalledWith('place', expect.anything());
    f.finish('view-1');
    await opening;
    expect(f.request).toHaveBeenCalledWith('place', { key: 'view-1', bounds });
  });

  it('does not let a late open or state resurrect a closed tab or release its replacement', async () => {
    const f = fixture(true);
    const first = f.driver.open(f.owner, 'paper', url);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    f.driver.release(f.owner, 'paper');
    const second = f.driver.open(f.owner, 'paper', url);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    f.finish('view-1');
    await first;
    expect(f.request).toHaveBeenCalledWith('release', { key: 'view-1' });
    f.emit(state('view-1'));
    expect(f.send).not.toHaveBeenCalled();
    f.finish('view-2');
    await second;
    f.emit(state('view-2'));
    expect(f.send).toHaveBeenCalledWith(
      'skb:web-state',
      expect.objectContaining({ id: 'paper', url }),
    );
    expect(f.request).not.toHaveBeenCalledWith('release', { key: 'view-2' });
  });

  it('keeps an overlay-hidden view hidden during window moves and restores it on placement', async () => {
    const f = fixture();
    await f.driver.open(f.owner, 'paper', url);
    f.driver.place(f.owner, 'paper', bounds);
    expect(await f.driver.snapshot(f.owner, 'paper')).toBe('data:image/png;base64,AA==');
    f.events.emit('move');
    expect(f.request).toHaveBeenLastCalledWith('place', { key: 'view-1', bounds: null });
    f.driver.place(f.owner, 'paper', bounds);
    f.events.emit('minimize');
    expect(f.request).toHaveBeenLastCalledWith('place', { key: 'view-1', bounds: null });
    f.events.emit('restore');
    expect(f.request).toHaveBeenLastCalledWith('place', { key: 'view-1', bounds });
  });

  it('reports helper failure and recreates the page at its latest address when retried', async () => {
    const f = fixture();
    await f.driver.open(f.owner, 'paper', url);
    f.emit(state('view-1', `${url}/second`));
    f.fail();
    expect(f.send).toHaveBeenLastCalledWith(
      'skb:web-state',
      expect.objectContaining({
        url: `${url}/second`,
        issue: { kind: 'crash', code: -1 },
        loading: false,
      }),
    );
    await f.driver.command(f.owner, 'paper', 'load', `${url}/second`);
    expect(f.request).toHaveBeenCalledWith(
      'open',
      expect.objectContaining({ url: `${url}/second` }),
    );
    expect(f.request.mock.calls.filter(([operation]) => operation === 'open')).toHaveLength(2);
    expect(f.request.mock.calls.filter(([operation]) => operation === 'command')).toHaveLength(0);
  });

  it('releases every owned surface when the application window closes', async () => {
    const f = fixture();
    await f.driver.open(f.owner, 'first', url);
    await f.driver.open(f.owner, 'second', url);
    f.events.emit('closed');
    expect(f.request).toHaveBeenCalledWith('release', { key: 'view-1' });
    expect(f.request).toHaveBeenCalledWith('release', { key: 'view-2' });
  });
});
