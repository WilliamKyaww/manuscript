import { create } from 'zustand';
import { type DesktopWebIssue, desktopBridge } from '../../../lib/desktop';
import { useWorkspace, type WorkspaceLayout } from './workspace-store';

/**
 * What the desktop app says about each web tab's page (Phase 26): its address, title and whether it
 * can go back. Not remembered — the tab remembers its address (`setTabUrl`), the page the rest. A tab
 * that closes lets its page go, so a closed page uses no memory.
 */

export interface WebPageState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  issue?: DesktopWebIssue | null;
}

export const useWebPages = create<{ pages: Record<string, WebPageState> }>(() => ({ pages: {} }));

const webTabIds = (layout: WorkspaceLayout) =>
  new Set(layout.panes.flatMap((pane) => pane.tabs.filter((tab) => tab.url).map((tab) => tab.id)));

let following = false;

/** Starts listening to the desktop app's web pages (once; nothing happens in a browser). */
export function followWebPages(): void {
  const web = desktopBridge()?.web;
  if (following || !web) return;
  following = true;
  web.onState((state) => {
    const { id, url, title, loading, canGoBack, canGoForward, issue } = state;
    useWebPages.setState((current) => ({
      pages: { ...current.pages, [id]: { url, title, loading, canGoBack, canGoForward, issue } },
    }));
    if (/^https?:\/\//iu.test(url)) useWorkspace.getState().setTabUrl(id, url);
  });
  let known = webTabIds(useWorkspace.getState());
  useWorkspace.subscribe((layout) => {
    const now = webTabIds(layout);
    for (const id of known)
      if (!now.has(id)) {
        void web.release(id);
        useWebPages.setState((current) => {
          const { [id]: _gone, ...rest } = current.pages;
          return { pages: rest };
        });
      }
    known = now;
  });
}

/** A tab's name: the page's title once it has one, its site until then. */
export function webTabTitle(url: string, page: WebPageState | undefined): string {
  if (page?.title && !/^https?:\/\//iu.test(page.title)) return page.title;
  try {
    return new URL(page?.url || url).hostname.replace(/^www\./u, '');
  } catch {
    return 'Web page';
  }
}
