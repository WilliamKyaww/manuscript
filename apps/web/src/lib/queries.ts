import { healthEndpoint } from '@skb/core';
import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from './api/client';

/** Query definitions shared by several features (one key factory per feature as features grow). */
export function healthQuery(api: ApiClient) {
  return queryOptions({
    queryKey: ['system', 'health'] as const,
    queryFn: () => api.request(healthEndpoint),
    staleTime: 60_000,
  });
}
