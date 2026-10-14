import type { WebContents } from 'electron';
import { webPageUrl } from './policy';

/** Only status codes cross the bridge; response bodies, headers and cookies remain in the page. */
export interface WebLoadIssue {
  kind: 'http' | 'load' | 'crash';
  code: number;
}

export interface WebLoadState {
  url: string;
  issue: WebLoadIssue | null;
}

/**
 * Chromium can retain the previous getURL() after a failed navigation. Remember the requested
 * address for retry, and distinguish a returned HTTP document from a transport failure: a 403 can
 * contain a perfectly usable human-verification form and must stay visible.
 */
export function watchWebLoad(
  contents: WebContents,
  state: WebLoadState,
  changed: () => void,
  appOrigin: () => string | null,
): void {
  const starting = (_event: Electron.Event, url: string, inPlace: boolean, main: boolean) => {
    const page = webPageUrl(url, appOrigin());
    if (!main || inPlace || !page) return;
    state.url = page;
    state.issue = null;
    changed();
  };
  contents.on('did-start-navigation', starting);
  contents.on('did-redirect-navigation', starting);
  contents.on('did-navigate', (_event, url, code) => {
    const page = webPageUrl(url, appOrigin());
    if (!page) return;
    state.url = page;
    state.issue = code >= 400 ? { kind: 'http', code } : null;
    changed();
  });
  contents.on('did-navigate-in-page', (_event, url, main) => {
    const page = webPageUrl(url, appOrigin());
    if (!main || !page) return;
    state.url = page;
    changed();
  });
  contents.on('did-fail-load', (_event, code, _description, url, main) => {
    // ERR_ABORTED is expected for Stop and superseded loads; a failed iframe is not a failed page.
    if (!main || code === -3 || webPageUrl(url, appOrigin()) !== state.url) return;
    state.issue = { kind: 'load', code };
    changed();
  });
  contents.on('render-process-gone', (_event, details) => {
    state.issue = { kind: 'crash', code: details.exitCode };
    changed();
  });
}
