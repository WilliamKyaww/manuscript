import {
  acceptDraftsEndpoint,
  acceptProposalEndpoint,
  aiGradeEndpoint,
  bulkProposalsEndpoint,
  estimateGenerationEndpoint,
  getPipelineEndpoint,
  getPipelineSettingsEndpoint,
  inboxCountsEndpoint,
  listDraftsEndpoint,
  listProposalsEndpoint,
  rejectDraftsEndpoint,
  rejectProposalEndpoint,
  runPipelineEndpoint,
  startGenerationEndpoint,
  suggestLinksEndpoint,
  updatePipelineSettingsEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SettingsService } from '../settings/service';
import type { DraftsService } from './drafts';
import type { GradingService } from './grading';
import type { LinkSuggester } from './links';
import type { PipelineService } from './pipeline';
import type { ProposalsService } from './proposals';
import type { GenerationService } from './service';

export interface GenerationRouteServices {
  generation: GenerationService;
  drafts: DraftsService;
  proposals: ProposalsService;
  grading: GradingService;
  links: LinkSuggester;
  pipeline: PipelineService;
  settings: SettingsService;
}

export function registerGenerationRoutes(
  registry: ApiRegistry,
  services: GenerationRouteServices,
): void {
  const { generation, drafts, proposals, grading, links, pipeline, settings } = services;

  registerEndpoint(registry, getPipelineSettingsEndpoint, () => settings.pipeline());
  registerEndpoint(registry, updatePipelineSettingsEndpoint, ({ body }) =>
    settings.updatePipeline(body),
  );
  registerEndpoint(registry, runPipelineEndpoint, ({ params, body }) =>
    pipeline.start(params.id, body.steps, 'manual'),
  );
  registerEndpoint(registry, getPipelineEndpoint, ({ params }) => ({
    run: pipeline.latest(params.id),
  }));

  registerEndpoint(registry, estimateGenerationEndpoint, ({ body }) => generation.estimate(body));
  registerEndpoint(registry, startGenerationEndpoint, ({ body }) => generation.start(body));

  registerEndpoint(registry, listDraftsEndpoint, () => drafts.list());
  registerEndpoint(registry, acceptDraftsEndpoint, ({ body }) => drafts.accept(body));
  registerEndpoint(registry, rejectDraftsEndpoint, ({ body }) => drafts.reject(body));

  registerEndpoint(registry, listProposalsEndpoint, ({ query }) => ({
    proposals: proposals.list(query.status, query.kind),
  }));
  registerEndpoint(registry, acceptProposalEndpoint, ({ params, body }) =>
    proposals.accept(params.id, body),
  );
  registerEndpoint(registry, rejectProposalEndpoint, ({ params }) => proposals.reject(params.id));
  registerEndpoint(registry, bulkProposalsEndpoint, ({ body }) =>
    proposals.bulk(body.ids, body.action),
  );
  registerEndpoint(registry, inboxCountsEndpoint, () => ({
    drafts: drafts.count(),
    proposals: proposals.pendingCount(),
  }));

  registerEndpoint(registry, aiGradeEndpoint, ({ params }, c) =>
    grading.suggest(params.id, c.req.raw.signal),
  );
  registerEndpoint(registry, suggestLinksEndpoint, ({ body }) => links.suggest(body.noteId));
}
