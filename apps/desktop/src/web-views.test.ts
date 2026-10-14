import type { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureWebSession, WebViews, webSession } from './web-views';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  const session = {
    getUserAgent: () => 'Manuscript/1.4.0 Chrome/152.0.7977.130 Electron/44.5.1',
    setUserAgent: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
  };
  class Contents extends EventEmitter {
    url = '';
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    loadURL = vi.fn(async () => undefined);
    reload = vi.fn();
    stop = vi.fn();
    getURL = () => this.url;
    getTitle = () => 'A paper';
    isLoading = () => false;
    isDestroyed = () => false;
  }
  return {
    session: { fromPartition: () => session },
    clipboard: {},
    Menu: {},
    shell: {},
    WebContentsView: class {
      webContents = new Contents();
      visible = false;
      setBackgroundColor() {}
      setBounds() {}
      setVisible(value: boolean) {
        this.visible = value;
      }
      getVisible() {
        return this.visible;
      }
    },
  };
});

interface TestView {
  webContents: EventEmitter & { url: string; loadURL: ReturnType<typeof vi.fn> };
  getVisible(): boolean;
}

const PAPER = 'https://papers.example/article';
const SECOND = 'https://papers.example/second';

function fixture(url = PAPER) {
  let view: TestView | undefined;
  const send = vi.fn();
  // Only the owner's view container and state channel are relevant to these lifecycle checks.
  const owner = {
    id: 1,
    isDestroyed: () => false,
    contentView: { addChildView: (child: TestView) => (view = child) },
    webContents: { send },
  } as unknown as BrowserWindow;
  const views = new WebViews(() => 'http://127.0.0.1:4317');
  views.open(owner, 'paper', url);
  if (!view) throw new Error('The web view was not created');
  const contents = view.webContents;
  const state = () => send.mock.lastCall?.[1];
  const start = (target = PAPER, main = true, inPlace = false) =>
    contents.emit('did-start-navigation', {}, target, inPlace, main, 1, 1);
  const redirect = (target: string) =>
    contents.emit('did-redirect-navigation', {}, target, false, true, 1, 1);
  const navigate = (target = PAPER, status = 200) => {
    contents.url = target;
    contents.emit('did-navigate', {}, target, status, '');
  };
  const fail = (target: string, code: number, main = true) =>
    contents.emit('did-fail-load', {}, code, 'net::ERR_FAILED', target, main, 1, 1);
  views.place(owner, 'paper', { x: 500, y: 100, width: 500, height: 600 });
  return { views, owner, view, contents, state, start, redirect, navigate, fail };
}

beforeEach(() => vi.clearAllMocks());

describe('web page load diagnostics', () => {
  it('reports a refused HTTP response while keeping its document visible for verification', () => {
    const page = fixture();
    page.start();
    page.navigate(PAPER, 403);
    expect(page.state()).toMatchObject({ url: PAPER, issue: { kind: 'http', code: 403 } });
    expect(page.view.getVisible()).toBe(true);
    expect(page.contents.loadURL).toHaveBeenCalledTimes(1);
    page.contents.emit('did-stop-loading');
    expect(page.state().issue).toEqual({ kind: 'http', code: 403 });
  });

  it('keeps the attempted URL after a main-frame network failure, then clears the error on retry', () => {
    const page = fixture();
    page.start();
    page.fail(PAPER, -105);
    expect(page.state()).toMatchObject({ url: PAPER, issue: { kind: 'load', code: -105 } });
    page.start();
    expect(page.state()).toMatchObject({ url: PAPER, issue: null });
    page.navigate();
    expect(page.state().issue).toBeNull();
  });

  it('follows redirected requests when a failure leaves getURL on the previous page', () => {
    const page = fixture();
    page.navigate();
    page.start();
    page.redirect(SECOND);
    page.fail(SECOND, -106);
    expect(page.state()).toMatchObject({ url: SECOND, issue: { kind: 'load', code: -106 } });
  });

  it('does not replace the retained URL with an address the navigation guard rejects', () => {
    const page = fixture();
    page.navigate();
    page.start('http://127.0.0.1:4317/');
    page.fail('http://127.0.0.1:4317/', -105);
    page.redirect('file:///notes.md');
    expect(page.state()).toMatchObject({ url: PAPER, issue: null });
  });

  it('ignores child-frame failures, superseded failures and cancelled navigations', () => {
    const page = fixture();
    page.navigate();
    page.start(SECOND, false);
    page.fail(SECOND, -105, false);
    expect(page.state()).toMatchObject({ url: PAPER, issue: null });
    page.start(SECOND);
    page.fail(PAPER, -105);
    page.fail(SECOND, -3);
    expect(page.state()).toMatchObject({ url: SECOND, issue: null });
  });

  it('keeps HTTP diagnostics through an in-page navigation and clears them on a new page', () => {
    const page = fixture();
    page.navigate(PAPER, 403);
    page.start(`${PAPER}#help`, true, true);
    page.contents.url = `${PAPER}#help`;
    page.contents.emit('did-navigate-in-page', {}, `${PAPER}#help`, true);
    expect(page.state()).toMatchObject({
      url: `${PAPER}#help`,
      issue: { kind: 'http', code: 403 },
    });
    page.start(SECOND);
    page.navigate(SECOND);
    expect(page.state()).toMatchObject({ url: SECOND, issue: null });
  });

  it('reports a renderer crash without losing the page to retry', () => {
    const page = fixture();
    page.navigate();
    page.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 7 });
    expect(page.state()).toMatchObject({ url: PAPER, issue: { kind: 'crash', code: 7 } });
  });
});

it('keeps the browser native identity and existing permission restrictions', () => {
  configureWebSession();
  expect(webSession().setUserAgent).not.toHaveBeenCalled();
  expect(webSession().setPermissionRequestHandler).toHaveBeenCalledOnce();
  expect(webSession().setPermissionCheckHandler).toHaveBeenCalledOnce();
});
