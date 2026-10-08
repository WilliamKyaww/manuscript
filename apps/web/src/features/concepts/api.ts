import {
  type ConceptInputSchema,
  createConceptEndpoint,
  deleteConceptEndpoint,
  getConceptEndpoint,
  listConceptsEndpoint,
  updateConceptEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { learningKeys } from '../learning/api';
import { notesKeys } from '../notes/api';

export const conceptsKeys = {
  all: ['concepts'] as const,
  list: () => ['concepts', 'list'] as const,
  concept: (id: string) => ['concepts', 'concept', id] as const,
};

export const conceptsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: conceptsKeys.list(),
    queryFn: () => api.request(listConceptsEndpoint),
    staleTime: 30_000,
  });

export const conceptQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: conceptsKeys.concept(id),
    queryFn: () => api.request(getConceptEndpoint, { params: { id } }),
  });

type ConceptInput = z.input<typeof ConceptInputSchema>;

/** Concept changes re-resolve links in notes and change module pages, so those refetch too. */
function useConceptMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: conceptsKeys.all }),
        queryClient.invalidateQueries({ queryKey: notesKeys.all }),
        queryClient.invalidateQueries({ queryKey: learningKeys.all }),
      ]),
  });
}

export function useConceptActions() {
  const api = useApi();
  return {
    create: useConceptMutation((body: ConceptInput) =>
      api.request(createConceptEndpoint, { body }),
    ),
    update: useConceptMutation(({ id, ...body }: Partial<ConceptInput> & { id: string }) =>
      api.request(updateConceptEndpoint, { params: { id }, body }),
    ),
    remove: useConceptMutation((id: string) =>
      api.request(deleteConceptEndpoint, { params: { id } }),
    ),
  };
}
