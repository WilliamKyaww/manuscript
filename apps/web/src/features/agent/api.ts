import {
  listAgentActionsEndpoint,
  listAgentToolsEndpoint,
  setToolPermissionEndpoint,
  type ToolPermission,
  undoAgentActionEndpoint,
} from '@skb/core';
import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** The agent's tools and what it has done (Phase 12). */

export const agentKeys = {
  all: ['agent'] as const,
  tools: () => ['agent', 'tools'] as const,
  actions: () => ['agent', 'actions'] as const,
};

export const agentToolsQuery = (api: ApiClient) =>
  queryOptions({ queryKey: agentKeys.tools(), queryFn: () => api.request(listAgentToolsEndpoint) });

export const agentActionsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: agentKeys.actions(),
    queryFn: () => api.request(listAgentActionsEndpoint, { query: { limit: 30 } }),
  });

/** An undo changes the knowledge base, so everything derived from it is refreshed. */
const REFRESHED = [
  'agent',
  'notes',
  'concepts',
  'graph',
  'relations',
  'review',
  'practice',
  'mastery',
  'inbox',
  'learning',
  'plan',
] as const;

/** Refetches everything the assistant (or an undo) may have changed. */
export function refreshKnowledge(queryClient: QueryClient): void {
  for (const key of REFRESHED) void queryClient.invalidateQueries({ queryKey: [key] });
}

export function useAgentActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => refreshKnowledge(queryClient);
  return {
    undo: useMutation({
      mutationFn: (id: string) => api.request(undoAgentActionEndpoint, { params: { id } }),
      onSuccess: refresh,
    }),
    setPermission: useMutation({
      mutationFn: ({ name, permission }: { name: string; permission: ToolPermission | null }) =>
        api.request(setToolPermissionEndpoint, { params: { name }, body: { permission } }),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: agentKeys.tools() }),
    }),
  };
}
