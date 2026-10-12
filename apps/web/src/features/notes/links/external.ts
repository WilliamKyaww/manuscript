import { desktopBridge } from '../../../lib/desktop';
import { useEditorPrefs } from '../editor/editor-prefs';
import { useWorkspace } from '../workspace/workspace-store';

/**
 * Links to the web (Phase 26, ADR-0045). A plain click opens the page in a pane beside the note when
 * the desktop app can show it there; Ctrl+click (⌘ on a Mac), a middle click, the link card's "Open
 * in browser", or a browser — which cannot show other sites inside a page — use the system browser.
 */

/** The address of a link to the web, or null: http(s) only, and `www.` addresses as https. */
export function externalUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  const candidate = /^www\./iu.test(trimmed) ? `https://${trimmed}` : trimmed;
  if (!/^https?:\/\//iu.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (url.username !== '' || url.password !== '' || url.hostname === '') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The address as a person reads it: no scheme, no trailing slash. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//iu, '').replace(/\/$/u, '');
}

/** Whether a click asks for the system browser rather than the pane. */
export function wantsBrowser(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  button?: number;
}): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey === true || event.button === 1;
}

export function openInBrowser(url: string): void {
  // In the desktop app the shell hands this to the system browser; in a browser it is a new tab.
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Whether web pages open beside notes here (the desktop app, unless turned off). */
export function opensBeside(): boolean {
  return Boolean(desktopBridge()?.web) && useEditorPrefs.getState().openLinksBeside;
}

/** Opens a web link from a note in `paneId`: beside it where possible, otherwise in the browser. */
export function openWebLink(url: string, options: { paneId?: string; browser?: boolean } = {}) {
  const target = externalUrl(url);
  if (!target) return;
  if (options.browser || !opensBeside()) openInBrowser(target);
  else useWorkspace.getState().openWebPage(target, options.paneId);
}
