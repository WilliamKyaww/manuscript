import {
  listAgentActionsEndpoint,
  listAgentToolsEndpoint,
  setToolPermissionEndpoint,
  undoAgentActionEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { AgentModule } from './index';
import { handleMcpRequest } from './mcp';

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

  // MCP over Streamable HTTP, behind the same token and Host checks as the rest of the API. Not a
  // JSON endpoint of ours: the MCP SDK reads and writes the JSON-RPC messages.
  registry.app.on(['POST', 'GET', 'DELETE'], '/api/mcp', (c) =>
    handleMcpRequest(agent.registry, c.req.raw),
  );
}
