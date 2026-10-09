import {
  createRelationEndpoint,
  deleteRelationEndpoint,
  type GraphFilterInput,
  graphEndpoint,
  graphPathEndpoint,
  graphReportEndpoint,
  listRelationsEndpoint,
  localGraphEndpoint,
  type RelationInput,
  type RelationUpdateSchema,
  updateRelationEndpoint,
} from '@skb/core';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { conceptsKeys } from '../concepts/api';

export const graphKeys = {
  all: ['graph'] as const,
  graph: (filter: GraphFilterInput) => ['graph', 'graph', filter] as const,
  local: (node: string, depth: number) => ['graph', 'local', node, depth] as const,
  path: (from: string, to: string) => ['graph', 'path', from, to] as const,
  report: (module: string | null) => ['graph', 'report', module] as const,
};

export const relationsKeys = {
  all: ['relations'] as const,
  node: (node: string) => ['relations', node] as const,
};

export const graphQuery = (api: ApiClient, filter: GraphFilterInput) =>
  queryOptions({
    queryKey: graphKeys.graph(filter),
    queryFn: () => api.request(graphEndpoint, { query: filter }),
    staleTime: 30_000,
    // Changing a filter keeps the current graph (and its layout) on screen until the new one comes.
    placeholderData: keepPreviousData,
  });

/** A node's neighbourhood; local panels ask for a small graph. */
export const localGraphQuery = (api: ApiClient, node: string, depth: 1 | 2) =>
  queryOptions({
    queryKey: graphKeys.local(node, depth),
    queryFn: () =>
      api.request(localGraphEndpoint, {
        query: {
          node,
          depth,
          limit: 300,
          types: ['concept', 'note', 'source', 'lecture', 'module'],
          // Proposals show (dashed or dotted) beside the item they concern.
          status: ['accepted', 'proposed'],
        },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const graphPathQuery = (api: ApiClient, from: string, to: string) =>
  queryOptions({
    queryKey: graphKeys.path(from, to),
    queryFn: () => api.request(graphPathEndpoint, { query: { from, to } }),
  });

export const graphReportQuery = (api: ApiClient, module: string | null) =>
  queryOptions({
    queryKey: graphKeys.report(module),
    queryFn: () => api.request(graphReportEndpoint, { query: module ? { module } : {} }),
    staleTime: 30_000,
  });

export const relationsQuery = (api: ApiClient, node: string) =>
  queryOptions({
    queryKey: relationsKeys.node(node),
    queryFn: () => api.request(listRelationsEndpoint, { query: { node } }),
  });

type RelationUpdate = z.input<typeof RelationUpdateSchema>;

/** Relation changes redraw the graph and change concept pages. */
function useRelationMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: relationsKeys.all }),
        queryClient.invalidateQueries({ queryKey: graphKeys.all }),
        queryClient.invalidateQueries({ queryKey: conceptsKeys.all }),
      ]),
  });
}

export function useRelationActions() {
  const api = useApi();
  return {
    create: useRelationMutation((body: RelationInput) =>
      api.request(createRelationEndpoint, { body }),
    ),
    update: useRelationMutation(({ id, ...body }: RelationUpdate & { id: string }) =>
      api.request(updateRelationEndpoint, { params: { id }, body }),
    ),
    remove: useRelationMutation((id: string) =>
      api.request(deleteRelationEndpoint, { params: { id } }),
    ),
  };
}
