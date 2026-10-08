import { listRecentEndpoint, recordRecentEndpoint, searchEndpoint } from '@skb/core';
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';

export const searchKeys = {
  results: (query: string) => ['search', 'results', query] as const,
  recent: () => ['search', 'recent'] as const,
};

const PAGE_SIZE = 20;

export function searchQuery(api: ApiClient, query: string) {
  return infiniteQueryOptions({
    queryKey: searchKeys.results(query),
    queryFn: ({ pageParam }) =>
      api.request(searchEndpoint, { query: { q: query, limit: PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      if (last.results.length < last.limit) return undefined;
      const next = last.offset + last.results.length;
      // A capped total is a lower bound: keep paging while full pages come back.
      return last.totalCapped || next < last.total ? next : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function recentQuery(api: ApiClient) {
  return queryOptions({
    queryKey: searchKeys.recent(),
    queryFn: () => api.request(listRecentEndpoint, { query: { limit: 30 } }),
    staleTime: 0,
  });
}

/** Remembers that a note was opened (best effort: failures never disturb the user). */
export function recordOpened(api: ApiClient, id: string): void {
  void api.request(recordRecentEndpoint, { body: { kind: 'note', id } }).catch(() => undefined);
}
