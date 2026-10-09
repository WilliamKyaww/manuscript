import {
  bulkCardsEndpoint,
  buryFaceEndpoint,
  type CardInput,
  type CardSetInputSchema,
  createCardEndpoint,
  createCardSetEndpoint,
  deleteCardEndpoint,
  deleteCardSetEndpoint,
  endSessionEndpoint,
  exportCardSetEndpoint,
  getCardEndpoint,
  getCardSetEndpoint,
  getReviewSettingsEndpoint,
  importCardSetEndpoint,
  listCardSetsEndpoint,
  type ReviewSettings,
  reviewEndpoint,
  reviewQueueEndpoint,
  reviewStatsEndpoint,
  startSessionEndpoint,
  undoReviewEndpoint,
  updateCardEndpoint,
  updateCardSetEndpoint,
  updateReviewSettingsEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** Flashcard queries and mutations (Phase 8). */

export const reviewKeys = {
  all: ['review'] as const,
  sets: () => ['review', 'sets'] as const,
  set: (id: string) => ['review', 'set', id] as const,
  card: (id: string) => ['review', 'card', id] as const,
  queue: (filter: QueueFilter) => ['review', 'queue', filter] as const,
  stats: () => ['review', 'stats'] as const,
  settings: () => ['review', 'settings'] as const,
};

export interface QueueFilter {
  set?: string;
  module?: string;
}

export const cardSetsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: reviewKeys.sets(),
    queryFn: () => api.request(listCardSetsEndpoint),
    staleTime: 15_000,
  });

export const cardSetQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: reviewKeys.set(id),
    queryFn: () => api.request(getCardSetEndpoint, { params: { id } }),
  });

export const cardQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: reviewKeys.card(id),
    queryFn: () => api.request(getCardEndpoint, { params: { id } }),
  });

export const reviewQueueQuery = (api: ApiClient, filter: QueueFilter) =>
  queryOptions({
    queryKey: reviewKeys.queue(filter),
    queryFn: () => api.request(reviewQueueEndpoint, { query: { ...filter, limit: 200 } }),
    // A session works through its own copy; it asks again when it runs out.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });

export const reviewStatsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: reviewKeys.stats(),
    queryFn: () => api.request(reviewStatsEndpoint),
    staleTime: 15_000,
  });

export const reviewSettingsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: reviewKeys.settings(),
    queryFn: () => api.request(getReviewSettingsEndpoint),
  });

type SetInput = z.input<typeof CardSetInputSchema>;

/** Any change to cards changes counts, sets and statistics. */
function useReviewMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: reviewKeys.all,
        // A running session keeps its queue; it refetches when it needs to.
        predicate: (query) => query.queryKey[1] !== 'queue',
      }),
  });
}

export function useCardActions() {
  const api = useApi();
  return {
    createSet: useReviewMutation((body: SetInput) => api.request(createCardSetEndpoint, { body })),
    updateSet: useReviewMutation(({ id, ...body }: Partial<SetInput> & { id: string }) =>
      api.request(updateCardSetEndpoint, { params: { id }, body }),
    ),
    deleteSet: useReviewMutation((id: string) =>
      api.request(deleteCardSetEndpoint, { params: { id } }),
    ),
    exportSet: useMutation({
      mutationFn: (id: string) => api.request(exportCardSetEndpoint, { params: { id } }),
    }),
    importSet: useReviewMutation(({ id, content }: { id: string; content: string }) =>
      api.request(importCardSetEndpoint, { params: { id }, body: { content } }),
    ),
    createCard: useReviewMutation((body: CardInput) => api.request(createCardEndpoint, { body })),
    updateCard: useReviewMutation(({ id, ...body }: Partial<CardInput> & { id: string }) =>
      api.request(updateCardEndpoint, { params: { id }, body }),
    ),
    deleteCard: useReviewMutation((id: string) =>
      api.request(deleteCardEndpoint, { params: { id } }),
    ),
    bulk: useReviewMutation(
      (body: {
        ids: string[];
        action: 'activate' | 'suspend' | 'delete' | 'move';
        setId?: string;
      }) => api.request(bulkCardsEndpoint, { body }),
    ),
    updateSettings: useReviewMutation((body: Partial<ReviewSettings>) =>
      api.request(updateReviewSettingsEndpoint, { body }),
    ),
  };
}

/** Calls used inside a review session (they do not refetch the session's queue). */
export function useSessionCalls() {
  const api = useApi();
  return useMemo(() => sessionCalls(api), [api]);
}

function sessionCalls(api: ApiClient) {
  return {
    start: (filter: QueueFilter) =>
      api.request(startSessionEndpoint, {
        body: {
          ...(filter.set ? { setId: filter.set } : {}),
          ...(filter.module ? { moduleId: filter.module } : {}),
        },
      }),
    end: (id: string) => api.request(endSessionEndpoint, { params: { id } }),
    rate: (body: z.input<typeof reviewEndpoint.schemas.body>) =>
      api.request(reviewEndpoint, { body }),
    undo: (sessionId?: string) =>
      api.request(undoReviewEndpoint, { body: sessionId ? { sessionId } : {} }),
    bury: (id: string, ordinal: number) =>
      api.request(buryFaceEndpoint, { params: { id }, body: { ordinal } }),
    queue: (filter: QueueFilter) =>
      api.request(reviewQueueEndpoint, { query: { ...filter, limit: 200 } }),
  };
}
