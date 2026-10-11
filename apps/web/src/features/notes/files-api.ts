import {
  type Bookmark,
  copyEntryEndpoint,
  getBookmarksEndpoint,
  getVersionEndpoint,
  keepVersionEndpoint,
  listVersionsEndpoint,
  mergeNoteEndpoint,
  putBookmarksEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { invalidateStructure, notesKeys } from './api';

/** Copies, merges, version history and bookmarks (Phase 23, ADR-0042). */

export function versionsQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: notesKeys.versions(id),
    queryFn: () => api.request(listVersionsEndpoint, { params: { id } }),
    staleTime: 0,
  });
}

export function versionQuery(api: ApiClient, id: string, versionId: string) {
  return queryOptions({
    queryKey: notesKeys.version(id, versionId),
    queryFn: () => api.request(getVersionEndpoint, { params: { id, versionId } }),
    // A kept version never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function bookmarksQuery(api: ApiClient) {
  return queryOptions({
    queryKey: notesKeys.bookmarks(),
    queryFn: () => api.request(getBookmarksEndpoint),
    staleTime: 60_000,
  });
}

export function useCopyEntry() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.request(copyEntryEndpoint, { body: { path } }),
    onSuccess: () => invalidateStructure(queryClient),
  });
}

export function useMergeNote() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      api.request(mergeNoteEndpoint, { params: { id: sourceId }, body: { targetId } }),
    onSuccess: () => invalidateStructure(queryClient),
  });
}

export function useKeepVersion() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request(keepVersionEndpoint, { params: { id } }),
    onSuccess: (_result, id) => queryClient.invalidateQueries({ queryKey: notesKeys.versions(id) }),
  });
}

export function useSetBookmarks() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: Bookmark[]) => api.request(putBookmarksEndpoint, { body: { items } }),
    onMutate: (items) => {
      // Shown at once; the server's answer (deduplicated) replaces it.
      queryClient.setQueryData(notesKeys.bookmarks(), { items });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notesKeys.bookmarks() }),
  });
}
