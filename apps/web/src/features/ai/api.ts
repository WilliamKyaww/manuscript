import {
  type AiRole,
  aiStatusEndpoint,
  aiUsageEndpoint,
  createProviderEndpoint,
  deleteProviderEndpoint,
  embeddingStatusEndpoint,
  getAiSettingsEndpoint,
  type ProviderInput,
  type ProviderUpdateSchema,
  rebuildEmbeddingsEndpoint,
  testProviderEndpoint,
  updateAiPreferencesEndpoint,
  updateProviderEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** AI settings, status, usage and embeddings (Phase 10). Keys go up; they never come back. */

export const aiKeys = {
  all: ['ai'] as const,
  settings: () => ['ai', 'settings'] as const,
  status: () => ['ai', 'status'] as const,
  usage: () => ['ai', 'usage'] as const,
  embeddings: () => ['ai', 'embeddings'] as const,
};

export const aiSettingsQuery = (api: ApiClient) =>
  queryOptions({ queryKey: aiKeys.settings(), queryFn: () => api.request(getAiSettingsEndpoint) });

export const aiStatusQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: aiKeys.status(),
    queryFn: () => api.request(aiStatusEndpoint),
    staleTime: 30_000,
  });

export const aiUsageQuery = (api: ApiClient) =>
  queryOptions({ queryKey: aiKeys.usage(), queryFn: () => api.request(aiUsageEndpoint) });

export const embeddingStatusQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: aiKeys.embeddings(),
    queryFn: () => api.request(embeddingStatusEndpoint),
    // While vectors are being made, follow along.
    refetchInterval: (query) => (query.state.data?.running ? 3_000 : false),
  });

type PreferencesBody = z.input<typeof updateAiPreferencesEndpoint.schemas.body>;

function useAiMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.all }),
  });
}

export function useAiActions() {
  const api = useApi();
  return {
    updatePreferences: useAiMutation((body: PreferencesBody) =>
      api.request(updateAiPreferencesEndpoint, { body }),
    ),
    createProvider: useAiMutation((body: ProviderInput) =>
      api.request(createProviderEndpoint, { body }),
    ),
    updateProvider: useAiMutation(
      ({ id, ...body }: z.input<typeof ProviderUpdateSchema> & { id: string }) =>
        api.request(updateProviderEndpoint, { params: { id }, body }),
    ),
    deleteProvider: useAiMutation((id: string) =>
      api.request(deleteProviderEndpoint, { params: { id } }),
    ),
    testProvider: useAiMutation(
      ({ id, model, role }: { id: string; model: string; role: AiRole }) =>
        api.request(testProviderEndpoint, { params: { id }, body: { model, role } }),
    ),
    rebuildEmbeddings: useAiMutation(() => api.request(rebuildEmbeddingsEndpoint)),
  };
}
