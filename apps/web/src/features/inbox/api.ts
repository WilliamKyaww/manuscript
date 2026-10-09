import {
  acceptDraftsEndpoint,
  acceptProposalEndpoint,
  aiGradeEndpoint,
  bulkProposalsEndpoint,
  estimateGenerationEndpoint,
  type GenerationRequest,
  inboxCountsEndpoint,
  listDraftsEndpoint,
  listProposalsEndpoint,
  type ProposalEditSchema,
  type ProposalKind,
  rejectDraftsEndpoint,
  rejectProposalEndpoint,
  startGenerationEndpoint,
  suggestLinksEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** Generation, drafts and proposals (Phase 11). */

export const inboxKeys = {
  all: ['inbox'] as const,
  counts: () => ['inbox', 'counts'] as const,
  drafts: () => ['inbox', 'drafts'] as const,
  proposals: (status: string, kind?: ProposalKind) =>
    ['inbox', 'proposals', status, kind ?? 'all'] as const,
  estimate: (request: GenerationRequest) => ['inbox', 'estimate', request] as const,
};

export const inboxCountsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: inboxKeys.counts(),
    queryFn: () => api.request(inboxCountsEndpoint),
    staleTime: 30_000,
  });

export const draftsQuery = (api: ApiClient) =>
  queryOptions({ queryKey: inboxKeys.drafts(), queryFn: () => api.request(listDraftsEndpoint) });

export const proposalsQuery = (
  api: ApiClient,
  status: 'pending' | 'accepted' | 'rejected' = 'pending',
  kind?: ProposalKind,
) =>
  queryOptions({
    queryKey: inboxKeys.proposals(status, kind),
    queryFn: () =>
      api.request(listProposalsEndpoint, { query: { status, ...(kind ? { kind } : {}) } }),
  });

export const estimateQuery = (api: ApiClient, request: GenerationRequest) =>
  queryOptions({
    queryKey: inboxKeys.estimate(request),
    queryFn: () => api.request(estimateGenerationEndpoint, { body: request }),
    staleTime: 10_000,
  });

/** Everything an Inbox decision can change: cards, questions, concepts, notes and the graph. */
const INVALIDATED = [
  'inbox',
  'review',
  'practice',
  'mastery',
  'concepts',
  'graph',
  'relations',
  'notes',
  'learning',
] as const;

function useInboxMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of INVALIDATED) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

type DraftIds = { cardIds?: string[]; questionIds?: string[] };

export function useInboxActions() {
  const api = useApi();
  return {
    acceptDrafts: useInboxMutation((body: DraftIds) =>
      api.request(acceptDraftsEndpoint, { body: body }),
    ),
    rejectDrafts: useInboxMutation((body: DraftIds) =>
      api.request(rejectDraftsEndpoint, { body: body }),
    ),
    accept: useInboxMutation(
      ({ id, edit = {} }: { id: string; edit?: z.input<typeof ProposalEditSchema> }) =>
        api.request(acceptProposalEndpoint, { params: { id }, body: edit }),
    ),
    reject: useInboxMutation((id: string) =>
      api.request(rejectProposalEndpoint, { params: { id } }),
    ),
    bulk: useInboxMutation(({ ids, action }: { ids: string[]; action: 'accept' | 'reject' }) =>
      api.request(bulkProposalsEndpoint, { body: { ids, action } }),
    ),
    suggestLinks: useInboxMutation((noteId: string) =>
      api.request(suggestLinksEndpoint, { body: { noteId } }),
    ),
  };
}

export function useStartGeneration() {
  const api = useApi();
  return useMutation({
    mutationFn: (request: GenerationRequest) =>
      api.request(startGenerationEndpoint, { body: request }),
  });
}

export function useAiGrade() {
  const api = useApi();
  return useMutation({
    mutationFn: (answerId: string) => api.request(aiGradeEndpoint, { params: { id: answerId } }),
  });
}
