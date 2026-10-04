import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import { AppShell } from './app/AppShell';
import { SessionGate } from './app/SessionGate';
import { SECTIONS } from './app/sections';
import { NotFoundPage, RouteErrorPage } from './features/errors/ErrorPages';
import { SectionPlaceholder } from './features/placeholder/SectionPlaceholder';
import { SettingsPage } from './features/settings/SettingsPage';
import { TodayPage } from './features/today/TodayPage';

// Code-based routes (ADR-0018): no generated route tree to keep in sync.
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
  component: TodayPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

/** Sections that are not built yet get an honest placeholder; each phase replaces one with real routes. */
const IMPLEMENTED = new Set(['today', 'settings']);
const placeholderRoutes = SECTIONS.filter((section) => !IMPLEMENTED.has(section.id)).map(
  (section) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: section.path,
      component: () => <SectionPlaceholder section={section} />,
    }),
);

export const routeTree = rootRoute.addChildren([todayRoute, settingsRoute, ...placeholderRoutes]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: RouteErrorPage,
    ...(options.history ? { history: options.history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
