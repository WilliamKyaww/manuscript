import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { StatusPage } from './features/system/StatusPage';

// Code-based routes (ADR-0018): no generated route tree to keep in sync.
const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: StatusPage,
});

export const routeTree = rootRoute.addChildren([indexRoute]);

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent' });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
