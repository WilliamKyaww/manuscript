import {
  type AskFilter,
  type AskScope,
  type ChatMode,
  createThreadEndpoint,
  deleteThreadEndpoint,
  getThreadEndpoint,
  listThreadsEndpoint,
  updateThreadEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** Chat threads (Phase 13). Messages are fetched with their thread; a run streams on top. */

export const chatKeys = {
  all: ['chat'] as const,
  threads: (q: string) => ['chat', 'threads', q] as const,
  thread: (id: string) => ['chat', 'thread', id] as const,
};

export const threadsQuery = (api: ApiClient, q = '') =>
  queryOptions({
    queryKey: chatKeys.threads(q),
    queryFn: () => api.request(listThreadsEndpoint, { query: q ? { q } : {} }),
  });

export const threadQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: chatKeys.thread(id),
    queryFn: () => api.request(getThreadEndpoint, { params: { id } }),
  });

export interface ThreadSettings {
  mode: ChatMode;
  scope: AskScope;
  filter?: AskFilter;
}

export function useChatActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: chatKeys.all });
  return {
    create: useMutation({
      mutationFn: (body: { title?: string } & Partial<ThreadSettings>) =>
        api.request(createThreadEndpoint, { body }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: { id: string; title?: string; clearAllowedTools?: boolean } & Partial<ThreadSettings>) =>
        api.request(updateThreadEndpoint, { params: { id }, body }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.request(deleteThreadEndpoint, { params: { id } }),
      onSuccess: refresh,
    }),
  };
}
