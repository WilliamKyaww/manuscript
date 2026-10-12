import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App, AppProviders } from '../app/App';
import { useLayoutStore } from '../app/layout-store';
import { useAppearance } from '../app/theme/appearance';
import { useThemeStore } from '../app/theme/theme';
import { useActiveNote } from '../features/notes/workspace/active-note';
import { emptyLayout, useWorkspace } from '../features/notes/workspace/workspace-store';
import { createApiClient } from '../lib/api/client';
import { createQueryClient } from '../lib/queryClient';
import { createAppRouter } from '../router';

export const HEALTH = {
  status: 'ok',
  version: '0.1.0',
  mode: 'test',
  startedAt: '2026-10-04T12:00:00.000Z',
  uptimeSeconds: 125,
  vault: {
    id: 'vault_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7',
    name: 'Study Vault',
    path: 'C:/Users/will/Documents/Study Vault',
  },
  database: {
    ok: true,
    sqliteVersion: '3.51.2',
    appliedMigrations: 1,
    latestMigration: '0001_init',
  },
};

export type FakeFetch = typeof globalThis.fetch;

export const healthyFetch: FakeFetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/api/health')) return new Response(JSON.stringify(HEALTH), { status: 200 });
  return new Response(
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
};

/** Resets module-level UI state between tests (stores are singletons). */
export function resetUiState(): void {
  localStorage.clear();
  useLayoutStore.setState({
    sidebarCollapsed: false,
    sidebarWidth: 216,
    narrow: false,
    narrowExpanded: false,
    commandPaletteOpen: false,
    shortcutsOpen: false,
    quickSwitcherOpen: false,
  });
  useThemeStore.setState({ preference: 'system', resolved: 'light' });
  useAppearance.setState({ palette: 'manuscript', simplified: true });
  useWorkspace.setState(emptyLayout());
  useActiveNote.setState({ view: null });
  document.documentElement.dataset.theme = 'light';
}

/** Renders the whole application at `path` with a fake server. */
export function renderApp(path = '/', fetch: FakeFetch = healthyFetch) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const result = render(
    <AppProviders queryClient={queryClient} apiClient={createApiClient({ fetch })}>
      <App router={router} />
    </AppProviders>,
  );
  return { ...result, router, queryClient };
}
