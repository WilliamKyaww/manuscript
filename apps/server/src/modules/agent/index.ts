import { type IdFactory, NotFoundError, type ToolInfo, type ToolPermission } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import type { Vault } from '../../vault/vault';
import type { AiService } from '../ai/service';
import { createActionsRepository } from './actions-repository';
import { createToolRegistry, type ToolRegistry } from './registry';
import { createSnapshotStore } from './snapshots';
import { conceptTools } from './tools/concepts';
import { fileTools } from './tools/files';
import { knowledgeTools } from './tools/knowledge';
import { learningTools } from './tools/learning';
import { sourceTools } from './tools/sources';
import type { AgentServices, AnyTool } from './types';

/** The agent's tool layer, built over the domain services (Phase 12). */

export const ALL_TOOLS: readonly AnyTool[] = [
  ...knowledgeTools,
  ...conceptTools,
  ...sourceTools,
  ...learningTools,
  ...fileTools,
];

export interface AgentModule {
  readonly registry: ToolRegistry;
  /** Sets (or, with null, clears) the person's override for a tool. */
  setPermission(name: string, permission: ToolPermission | null): ToolInfo;
}

export interface AgentDependencies {
  db: SqlDatabase;
  vault: Vault;
  services: AgentServices;
  /** The AI service that keeps preferences (not the wrapper that re-embeds on change). */
  ai: AiService;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
}

export function createAgentModule(deps: AgentDependencies): AgentModule {
  const registry = createToolRegistry({
    tools: ALL_TOOLS,
    services: deps.services,
    actions: createActionsRepository(deps.db),
    snapshots: createSnapshotStore(deps.vault),
    permissions: () => deps.ai.settings().preferences.toolPermissions,
    clock: deps.clock,
    ids: deps.ids,
    logger: deps.logger,
  });
  return {
    registry,
    setPermission(name, permission) {
      if (!registry.tool(name)) throw new NotFoundError('There is no such tool.');
      deps.ai.updatePreferences({ toolPermissions: { [name]: permission } });
      return registry.info(name);
    },
  };
}
