import {
  CODE_GRAPH_UPLOAD_PATH,
  CodeImportResultSchema,
  conceptCodeEndpoint,
  createBackupEndpoint,
  decideCodeLinkEndpoint,
  deleteCodeGraphEndpoint,
  deleteExportEndpoint,
  forgetVaultEndpoint,
  getCodeEntityEndpoint,
  getDataOverviewEndpoint,
  inspectVaultEndpoint,
  linkCodeEndpoint,
  listBackupsEndpoint,
  listCodeGraphsEndpoint,
  materialiseConceptsEndpoint,
  rematchCodeGraphEndpoint,
  removeCodeLinkEndpoint,
  rescanEndpoint,
  restoreEndpoint,
  searchCodeEntitiesEndpoint,
  startExportEndpoint,
  switchVaultEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** Settings → Data and imported code graphs (Phase 16). */

export const dataKeys = {
  all: ['data'] as const,
  overview: () => ['data', 'overview'] as const,
};

export const codeKeys = {
  all: ['code'] as const,
  graphs: () => ['code', 'graphs'] as const,
  concept: (id: string) => ['code', 'concept', id] as const,
  entity: (id: string) => ['code', 'entity', id] as const,
};

export const dataOverviewQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: dataKeys.overview(),
    queryFn: () => api.request(getDataOverviewEndpoint),
  });

export const backupsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: ['data', 'backups'] as const,
    queryFn: () => api.request(listBackupsEndpoint),
  });

export function useBackupActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  return {
    backUpNow: useMutation({
      mutationFn: () => api.request(createBackupEndpoint),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.all }),
    }),
  };
}

export const codeGraphsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: codeKeys.graphs(),
    queryFn: () => api.request(listCodeGraphsEndpoint),
  });

export const conceptCodeQuery = (api: ApiClient, conceptId: string) =>
  queryOptions({
    queryKey: codeKeys.concept(conceptId),
    queryFn: () => api.request(conceptCodeEndpoint, { params: { id: conceptId } }),
  });

export const searchCodeQuery = (api: ApiClient, q: string) =>
  queryOptions({
    queryKey: ['code', 'search', q] as const,
    queryFn: () => api.request(searchCodeEntitiesEndpoint, { query: { q, limit: 10 } }),
    enabled: q.trim().length >= 2,
  });

export const codeEntityQuery = (api: ApiClient, entityId: string) =>
  queryOptions({
    queryKey: codeKeys.entity(entityId),
    queryFn: () => api.request(getCodeEntityEndpoint, { params: { id: entityId } }),
  });

export function useDataActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: dataKeys.all });
  return {
    startExport: useMutation({
      mutationFn: () => api.request(startExportEndpoint),
      onSuccess: refresh,
    }),
    deleteExport: useMutation({
      mutationFn: (name: string) => api.request(deleteExportEndpoint, { params: { name } }),
      onSuccess: refresh,
    }),
    restore: useMutation({
      mutationFn: (body: { archive: string; target: string }) =>
        api.request(restoreEndpoint, { body }),
      onSuccess: refresh,
    }),
    rescan: useMutation({
      mutationFn: () => api.request(rescanEndpoint),
      onSuccess: refresh,
    }),
    inspect: useMutation({
      mutationFn: (path: string) => api.request(inspectVaultEndpoint, { body: { path } }),
    }),
    switchVault: useMutation({
      mutationFn: (path: string) => api.request(switchVaultEndpoint, { body: { path } }),
      onSuccess: refresh,
    }),
    forgetVault: useMutation({
      mutationFn: (path: string) => api.request(forgetVaultEndpoint, { body: { path } }),
      onSuccess: refresh,
    }),
    materialise: useMutation({
      mutationFn: (folder: string) =>
        api.request(materialiseConceptsEndpoint, { body: { folder } }),
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  };
}

export function useCodeActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: codeKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['graph'] });
  };
  return {
    importGraph: useMutation({
      mutationFn: ({ file, name, module }: { file: File; name?: string; module?: string }) => {
        const form = new FormData();
        form.append('file', file);
        if (name?.trim()) form.append('name', name.trim());
        if (module?.trim()) form.append('module', module.trim());
        return api.upload(CODE_GRAPH_UPLOAD_PATH, form, CodeImportResultSchema);
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.request(deleteCodeGraphEndpoint, { params: { id } }),
      onSuccess: refresh,
    }),
    rematch: useMutation({
      mutationFn: (id: string) => api.request(rematchCodeGraphEndpoint, { params: { id } }),
      onSuccess: refresh,
    }),
    link: useMutation({
      mutationFn: ({ conceptId, entityId }: { conceptId: string; entityId: string }) =>
        api.request(linkCodeEndpoint, { params: { id: conceptId }, body: { entityId } }),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: ({
        conceptId,
        entityId,
        status,
      }: {
        conceptId: string;
        entityId: string;
        status: 'accepted' | 'rejected';
      }) =>
        api.request(decideCodeLinkEndpoint, {
          params: { id: conceptId, entityId },
          body: { status },
        }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: ({ conceptId, entityId }: { conceptId: string; entityId: string }) =>
        api.request(removeCodeLinkEndpoint, { params: { id: conceptId, entityId } }),
      onSuccess: refresh,
    }),
  };
}
