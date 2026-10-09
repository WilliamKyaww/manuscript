import {
  aiStatusEndpoint,
  aiUsageEndpoint,
  createProviderEndpoint,
  deleteProviderEndpoint,
  getAiSettingsEndpoint,
  testProviderEndpoint,
  updateAiPreferencesEndpoint,
  updateProviderEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { AiService } from './service';

const ok = { ok: true as const };

export function registerAiRoutes(registry: ApiRegistry, ai: AiService): void {
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
}
