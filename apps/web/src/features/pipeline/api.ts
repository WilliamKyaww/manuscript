import {
  getPipelineEndpoint,
  getPipelineSettingsEndpoint,
  type PipelineSettings,
  type PipelineStep,
  runPipelineEndpoint,
  updatePipelineSettingsEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** The lecture pipeline and its settings (Phase 15). */

export const pipelineKeys = {
  all: ['pipeline'] as const,
  lecture: (id: string) => ['pipeline', 'lecture', id] as const,
  settings: () => ['pipeline', 'settings'] as const,
};

export const pipelineRunQuery = (api: ApiClient, lectureId: string) =>
  queryOptions({
    queryKey: pipelineKeys.lecture(lectureId),
    queryFn: () => api.request(getPipelineEndpoint, { params: { id: lectureId } }),
    // While it runs, follow along.
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === 'queued' || status === 'running' ? 1_500 : false;
    },
  });

export const pipelineSettingsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: pipelineKeys.settings(),
    queryFn: () => api.request(getPipelineSettingsEndpoint),
  });

export function usePipelineActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
  return {
    run: useMutation({
      mutationFn: ({ lectureId, steps }: { lectureId: string; steps?: PipelineStep[] }) =>
        api.request(runPipelineEndpoint, {
          params: { id: lectureId },
          body: steps ? { steps } : {},
        }),
      onSuccess: refresh,
    }),
    updateSettings: useMutation({
      mutationFn: (body: Partial<PipelineSettings>) =>
        api.request(updatePipelineSettingsEndpoint, { body }),
      onSuccess: refresh,
    }),
  };
}
