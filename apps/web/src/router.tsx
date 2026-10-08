import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import { AppShell } from './app/AppShell';
import { SessionGate } from './app/SessionGate';
import { SECTIONS } from './app/sections';
import { NotFoundPage, RouteErrorPage } from './features/errors/ErrorPages';
import { PagePending } from './features/errors/PagePending';
import { SectionPlaceholder } from './features/placeholder/SectionPlaceholder';

// Code-based routes (ADR-0018): no generated route tree to keep in sync.
// Every page is its own chunk (task 3.24), so heavy libraries such as the editor, KaTeX and Mermaid
// load only with the pages that use them and the initial bundle stays small.
function RootLayout() {
  return (
    <SessionGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </SessionGate>
  );
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./features/today/TodayPage'), 'TodayPage'),
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./features/settings/SettingsPage'), 'SettingsPage'),
});

const NotesPage = lazyRouteComponent(() => import('./features/notes/NotesPage'), 'NotesPage');
const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes',
  component: NotesPage,
});
const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes/$noteId',
  component: NotesPage,
  // `?line=12` opens the note at a line (used by backlinks).
  validateSearch: (search: Record<string, unknown>): { line?: number } => {
    const line = Number(search.line);
    return Number.isInteger(line) && line > 0 ? { line } : {};
  },
});

/** Sections that are not built yet get an honest placeholder; each phase replaces one with real routes. */
const IMPLEMENTED = new Set(['today', 'notes', 'settings']);
const placeholderRoutes = SECTIONS.filter((section) => !IMPLEMENTED.has(section.id)).map(
  (section) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: section.path,
      component: () => <SectionPlaceholder section={section} />,
    }),
);

export const routeTree = rootRoute.addChildren([
  todayRoute,
  settingsRoute,
  notesRoute,
  noteRoute,
  ...placeholderRoutes,
]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: RouteErrorPage,
    defaultPendingComponent: PagePending,
    ...(options.history ? { history: options.history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
