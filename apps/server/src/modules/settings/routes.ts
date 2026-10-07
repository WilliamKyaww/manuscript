import { getNotesSettingsEndpoint, updateNotesSettingsEndpoint } from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SettingsService } from './service';

export function registerSettingsRoutes(registry: ApiRegistry, settings: SettingsService): void {
  registerEndpoint(registry, getNotesSettingsEndpoint, () => settings.notes());
  registerEndpoint(registry, updateNotesSettingsEndpoint, ({ body }) => settings.updateNotes(body));
}
