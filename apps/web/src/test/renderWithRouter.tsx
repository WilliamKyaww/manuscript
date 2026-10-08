import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppProviders } from '../app/App';
import { createApiClient } from '../lib/api/client';
import { createQueryClient } from '../lib/queryClient';
import type { FakeFetch } from './renderApp';

const notFound: FakeFetch = async () =>
  new Response(
    JSON.stringify({
      type: 'urn:skb:problem:not_found',
      title: 'Not found',
      status: 404,
      code: 'not_found',
    }),
    {
      status: 404,
    },
  );

/**
 * Renders a component inside a minimal router (so `Link` works) and the app's providers, with a
 * fake server. Navigations land on `/notes/$noteId`, which shows "Opened <id>".
 */
export function renderWithRouter(ui: ReactNode, fetch: FakeFetch = notFound) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  });
  const note = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes/$noteId',
    component: function Opened() {
      const { noteId } = note.useParams();
      return <p>Opened {noteId}</p>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, note]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const result = render(
    <AppProviders queryClient={queryClient} apiClient={createApiClient({ fetch })}>
      {/* biome-ignore lint/suspicious/noExplicitAny: test routers are not the registered app router. */}
      <RouterProvider router={router as any} />
    </AppProviders>,
  );
  return { ...result, router, queryClient };
}
