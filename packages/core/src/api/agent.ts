import { z } from 'zod';
import { TOOL_PERMISSIONS, TOOL_RISKS } from '../agent/policy';
import { idSchema } from '../ids';
import { defineEndpoint } from './contract';

/**
 * The agent's tools and what they have done (agent-system.md §§6–8, Phase 12): the catalogue with
 * each tool's risk and the user's override, and the action log, from which a write can be undone.
 */

export const AgentActionIdSchema = idSchema('action');
export const ToolRiskSchema = z.enum(TOOL_RISKS);
export const ToolPermissionSchema = z.enum(TOOL_PERMISSIONS);

/** Who asked for the call: the in-app agent, an MCP client, or the person through the log. */
export const ACTION_ACTORS = ['agent', 'mcp'] as const;

export const ACTION_STATUSES = ['executed', 'denied', 'failed', 'undone'] as const;

export const AgentActionSchema = z.object({
  id: AgentActionIdSchema,
  tool: z.string(),
  risk: ToolRiskSchema,
  actor: z.enum(ACTION_ACTORS),
  status: z.enum(ACTION_STATUSES),
  /** How it was allowed to run: by the policy, or because the person approved it. */
  approval: z.enum(['auto', 'user']).nullable(),
  /** One line for the activity list: "Created 24 flashcards in “COC251 · L01–L03”". */
  summary: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.string().nullable(),
  createdAt: z.string(),
  undoneAt: z.string().nullable(),
  /** The call changed something and nothing has changed it since (so undoing is safe). */
  undoable: z.boolean(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const ToolInfoSchema = z.object({
  name: z.string(),
  category: z.string(),
  description: z.string(),
  risk: ToolRiskSchema,
  /** The person's choice for this tool, or null for the default of its risk. */
  permission: ToolPermissionSchema.nullable(),
  /** Offered to MCP clients (read and write tools; never destructive ones). */
  mcp: z.boolean(),
  /** Cannot be undone, so it always asks (recording an answer). */
  permanent: z.boolean().default(false),
});
export type ToolInfo = z.infer<typeof ToolInfoSchema>;

export const listAgentActionsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/agent/actions',
  query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
  response: z.object({ actions: z.array(AgentActionSchema) }),
});

export const undoAgentActionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/agent/actions/:id/undo',
  params: z.object({ id: AgentActionIdSchema }),
  response: AgentActionSchema,
});

export const listAgentToolsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/agent/tools',
  response: z.object({ tools: z.array(ToolInfoSchema) }),
});

export const setToolPermissionEndpoint = defineEndpoint({
  method: 'PUT',
  path: '/api/agent/tools/:name/permission',
  params: z.object({ name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u) }),
  /** null returns the tool to the default for its risk. */
  body: z.object({ permission: ToolPermissionSchema.nullable() }),
  response: ToolInfoSchema,
});
