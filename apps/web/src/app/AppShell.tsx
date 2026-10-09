import { useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { AskPanel } from '../features/ai/AskPanel';
import { QuickAddHost } from '../features/review/QuickAddHost';
import { QuickSwitcher } from '../features/search/QuickSwitcher';
import { useServerEvents } from '../lib/events';
import { CommandPalette } from './CommandPalette';
import { GlobalShortcuts } from './GlobalShortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';

/**
 * Application frame (ui.md §2): sidebar + main area filling the viewport. The window never scrolls;
 * each route's <Page> owns the only scroll container below its fixed header.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useFocusPageTitleOnNavigation();
  useServerEvents();
  return (
    <div data-app-shell className="flex h-dvh overflow-hidden bg-bg text-text">
      {/* A button rather than a fragment link, so the router never sees a "#main" navigation. */}
      <button
        type="button"
        className="skip-link"
        onClick={() => document.getElementById('main')?.focus()}
      >
        Skip to main content
      </button>
      <Sidebar />
      <main
        id="main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col overflow-hidden focus:outline-none"
      >
        {children}
      </main>
      <CommandPalette />
      <QuickSwitcher />
      <ShortcutsDialog />
      <GlobalShortcuts />
      <QuickAddHost />
      <AskPanel />
    </div>
  );
}

/**
 * After client-side navigation to another section, move focus to the new page's heading so screen
 * readers announce it. Uses the resolved location, so lazily loaded pages have rendered by then;
 * moving within a section (one note to another) leaves focus where it is, e.g. in the file tree.
 */
function useFocusPageTitleOnNavigation(): void {
  const section = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname.split('/')[1] ?? '',
  });
  const previous = useRef(section);
  useEffect(() => {
    // The first render is a page load, not a navigation: leave focus where the browser puts it.
    if (previous.current === section) return;
    previous.current = section;
    const frame = requestAnimationFrame(() => {
      // A page may name the control people use first (the search box); otherwise its title.
      const target =
        document.querySelector<HTMLElement>(
          '[data-page-body] [data-autofocus], [data-page-header] [data-autofocus]',
        ) ?? document.querySelector<HTMLElement>('[data-page-title]');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);
}
