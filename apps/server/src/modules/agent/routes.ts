import {
  listAgentActionsEndpoint,
  listAgentToolsEndpoint,
  setToolPermissionEndpoint,
  undoAgentActionEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { AgentModule } from './index';

export function registerAgentRoutes(registry: ApiRegistry, agent: AgentModule): void {
  registerEndpoint(registry, listAgentActionsEndpoint, ({ query }) => ({
    actions: agent.registry.actions(query.limit),
  }));
  registerEndpoint(registry, undoAgentActionEndpoint, ({ params }) =>
    agent.registry.undo(params.id),
  );
  registerEndpoint(registry, listAgentToolsEndpoint, () => ({ tools: agent.registry.list() }));
  registerEndpoint(registry, setToolPermissionEndpoint, ({ params, body }) =>
    agent.setPermission(params.name, body.permission),
  );
}
