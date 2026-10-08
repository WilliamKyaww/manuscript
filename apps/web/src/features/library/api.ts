import {
  deleteSourceEndpoint,
  getSourceEndpoint,
  ImportResultSchema,
  type JobSummary,
  listSourcesEndpoint,
  retrySourceEndpoint,
  SOURCE_UPLOAD_PATH,
  type SourceSummary,
  sourceSectionsEndpoint,
} from '@skb/core';
import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { onServerEvent } from '../../lib/events';
import { notesKeys } from '../notes/api';

/** Query keys for the library (one factory per feature, architecture.md §4). */
export const sourcesKeys = {
  all: ['sources'] as const,
  list: () => ['sources', 'list'] as const,
  source: (id: string) => ['sources', 'source', id] as const,
  sections: (id: string) => ['sources', 'sections', id] as const,
};

export function sourcesQuery(api: ApiClient) {
  return queryOptions({
    queryKey: sourcesKeys.list(),
    queryFn: () => api.request(listSourcesEndpoint),
    staleTime: 30_000,
  });
}

export function sourceQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: sourcesKeys.source(id),
    queryFn: () => api.request(getSourceEndpoint, { params: { id } }),
    staleTime: 30_000,
  });
}

export function sectionsQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: sourcesKeys.sections(id),
    queryFn: () => api.request(sourceSectionsEndpoint, { params: { id } }),
    staleTime: 5 * 60_000,
  });
}

export function useImportSource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, moduleCode }: { file: File; moduleCode?: string | null }) => {
      const form = new FormData();
      form.append('file', file);
      if (moduleCode) form.append('module', moduleCode);
      return api.upload(SOURCE_UPLOAD_PATH, form, ImportResultSchema);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sourcesKeys.list() }),
        queryClient.invalidateQueries({ queryKey: notesKeys.tree() }),
      ]),
  });
}

export function useRetrySource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request(retrySourceEndpoint, { params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourcesKeys.all }),
  });
}

export function useDeleteSource() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request(deleteSourceEndpoint, { params: { id } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sourcesKeys.list() }),
        queryClient.invalidateQueries({ queryKey: notesKeys.all }),
      ]),
  });
}

/** Writes a job's latest state into a cached source, so progress shows without refetching. */
export function applyJobToSource(source: SourceSummary, job: JobSummary): SourceSummary {
  const active = job.status === 'queued' || job.status === 'running';
  return {
    ...source,
    job: active ? job : null,
    status: job.status === 'running' && source.status === 'pending' ? 'processing' : source.status,
  };
}

function patchCaches(queryClient: QueryClient, job: JobSummary): void {
  const id = job.subject;
  if (!id) return;
  queryClient.setQueryData(sourcesKeys.list(), (data: { sources: SourceSummary[] } | undefined) =>
    data
      ? {
          sources: data.sources.map((source) =>
            source.id === id ? applyJobToSource(source, job) : source,
          ),
        }
      : data,
  );
  queryClient.setQueryData(sourcesKeys.source(id), (data: SourceSummary | undefined) =>
    data ? { ...data, ...applyJobToSource(data, job) } : data,
  );
}

/** Keeps import progress live while a library view is open. */
export function useLiveImportProgress(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onServerEvent((event) => {
        if (event.type === 'job.updated' && event.job.kind === 'source.ingest')
          patchCaches(queryClient, event.job);
      }),
    [queryClient],
  );
}
