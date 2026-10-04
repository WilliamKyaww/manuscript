import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

/** Client errors (4xx) are not retried: repeating an unauthorised or invalid request cannot help. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export interface QueryClientOptions {
  /** Called when any mutation fails (the app shows a toast; queries render errors inline). */
  onMutationError?: (error: unknown) => void;
}

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => options.onMutationError?.(error),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
