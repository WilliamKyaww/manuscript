import {
  ASK_PATH,
  type AskEvent,
  AskInputSchema,
  aiStatusEndpoint,
  aiUsageEndpoint,
  createProviderEndpoint,
  deleteProviderEndpoint,
  embeddingStatusEndpoint,
  getAiSettingsEndpoint,
  issuesFromZod,
  rebuildEmbeddingsEndpoint,
  testProviderEndpoint,
  updateAiPreferencesEndpoint,
  updateProviderEndpoint,
  ValidationError,
} from '@skb/core';
import { stream } from 'hono/streaming';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { Logger } from '../../shared/logger';
import type { AskService } from './ask';
import type { EmbeddingService } from './embeddings/service';
import type { AiService } from './service';

const ok = { ok: true as const };

export interface AiRouteServices {
  ai: AiService;
  ask: AskService;
  embeddings: EmbeddingService;
  logger: Logger;
}

export function registerAiRoutes(registry: ApiRegistry, services: AiRouteServices): void {
  const { ai, ask, embeddings, logger } = services;
  registerEndpoint(registry, getAiSettingsEndpoint, () => ai.settings());
  registerEndpoint(registry, updateAiPreferencesEndpoint, ({ body }) => ai.updatePreferences(body));
  registerEndpoint(registry, createProviderEndpoint, ({ body }) => ai.createProvider(body));
  registerEndpoint(registry, updateProviderEndpoint, ({ params, body }) =>
    ai.updateProvider(params.id, body),
  );
  registerEndpoint(registry, deleteProviderEndpoint, ({ params }) => {
    ai.deleteProvider(params.id);
    return ok;
  });
  registerEndpoint(registry, testProviderEndpoint, ({ params, body }) =>
    ai.testProvider(params.id, body.model, body.role),
  );
  registerEndpoint(registry, aiStatusEndpoint, () => ai.status());
  registerEndpoint(registry, aiUsageEndpoint, () => ai.usageReport());
  registerEndpoint(registry, embeddingStatusEndpoint, () => embeddings.status());
  registerEndpoint(registry, rebuildEmbeddingsEndpoint, () => embeddings.rebuild());

  // A grounded answer, streamed as one JSON event per line (application/x-ndjson).
  registry.app.post(ASK_PATH, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ValidationError('The request body must be valid JSON.');
    }
    const parsed = AskInputSchema.safeParse(raw);
    if (!parsed.success)
      throw new ValidationError('Invalid request body.', issuesFromZod(parsed.error));
    c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    return stream(c, async (out) => {
      const stop = new AbortController();
      out.onAbort(() => stop.abort());
      const send = (event: AskEvent) => out.write(`${JSON.stringify(event)}\n`);
      try {
        for await (const event of ask.ask(parsed.data, stop.signal)) await send(event);
      } catch (error) {
        logger.error('ai.ask.crashed', { error });
        await send({
          type: 'error',
          code: 'provider',
          message: 'Something went wrong while answering.',
        });
      }
    });
  });
}
