import {
  generatePlanEndpoint,
  getPlanEndpoint,
  getPlanSettingsEndpoint,
  type PlanItem,
  type PlanSettings,
  updatePlanItemEndpoint,
  updatePlanSettingsEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** The study plan and the availability it is made from (Phase 14). */

export const planKeys = {
  all: ['plan'] as const,
  current: () => ['plan', 'current'] as const,
  settings: () => ['plan', 'settings'] as const,
};

export const planQuery = (api: ApiClient) =>
  queryOptions({ queryKey: planKeys.current(), queryFn: () => api.request(getPlanEndpoint) });

export const planSettingsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: planKeys.settings(),
    queryFn: () => api.request(getPlanSettingsEndpoint),
  });

export function usePlanActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: planKeys.all });
  return {
    generate: useMutation({
      mutationFn: (days: number) => api.request(generatePlanEndpoint, { body: { days } }),
      onSuccess: refresh,
    }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: PlanItem['status'] }) =>
        api.request(updatePlanItemEndpoint, { params: { id }, body: { status } }),
      onSuccess: refresh,
    }),
    updateSettings: useMutation({
      mutationFn: (body: Partial<PlanSettings>) =>
        api.request(updatePlanSettingsEndpoint, { body }),
      onSuccess: refresh,
    }),
  };
}
