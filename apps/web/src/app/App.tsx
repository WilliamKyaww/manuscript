import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { TooltipProvider } from '../components/Tooltip';
import type { ApiClient } from '../lib/api/client';
import { ApiProvider } from '../lib/api/context';
import type { AppRouter } from '../router';
import { useShortcutDispatcher } from './shortcuts/useShortcuts';
import { Toaster } from './Toaster';
import { useAppearanceSync } from './theme/appearance';
import { useThemeSync } from './theme/theme';

/** Context providers shared by the real app and component tests. */
export function AppProviders({
  queryClient,
  apiClient,
  children,
}: {
  queryClient: QueryClient;
  apiClient?: ApiClient;
  children: ReactNode;
}) {
  return (
    <ApiProvider {...(apiClient ? { client: apiClient } : {})}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}

/** The application: global behaviour (theme, keyboard) plus the router and toasts. */
export function App({ router }: { router: AppRouter }) {
  useThemeSync();
  useAppearanceSync();
  useShortcutDispatcher();
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
