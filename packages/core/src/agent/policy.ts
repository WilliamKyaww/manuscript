/**
 * The permission policy for the agent's tools (agent-system.md §7, ADR-0013). Pure, so the server,
 * the settings page and the tests agree on what a tool call needs before it runs.
 *
 * | Risk        | Default                              | The user can set |
 * |-------------|--------------------------------------|------------------|
 * | read        | runs                                 | ask · deny       |
 * | write       | runs, is logged and can be undone    | ask · deny       |
 * | destructive | asks every time                      | deny (never auto)|
 *
 * A write that touches more than `BULK_THRESHOLD` items in one call counts as destructive.
 *
 * A *permanent* write cannot be undone (recording an answer as evidence of what the student knows):
 * it always asks, but unlike a destructive call it may be approved for the rest of a chat, because
 * the student is the one giving the answer and sees exactly what is recorded.
 */

export const TOOL_RISKS = ['read', 'write', 'destructive'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

/** What the user may choose for a tool in Settings; absent means the default for its risk. */
export const TOOL_PERMISSIONS = ['auto', 'ask', 'deny'] as const;
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

export const BULK_THRESHOLD = 20;

export type ApprovalDecision = 'approve' | 'ask' | 'deny';

export interface PolicyResult {
  decision: ApprovalDecision;
  /** The risk after escalation, which is what the activity and the log show. */
  risk: ToolRisk;
  /** Why the call needs asking or was refused, in words for the person. */
  reason: string | null;
}

export function effectiveRisk(risk: ToolRisk, items: number): ToolRisk {
  return risk === 'write' && items > BULK_THRESHOLD ? 'destructive' : risk;
}

export function decideApproval(input: {
  risk: ToolRisk;
  /** How many things the call touches (cards, notes, files…); 1 when it is a single thing. */
  items?: number;
  override?: ToolPermission | undefined;
  /** The call cannot be taken back. */
  permanent?: boolean | undefined;
}): PolicyResult {
  const items = input.items ?? 1;
  const risk = effectiveRisk(input.risk, items);
  if (input.override === 'deny')
    return { decision: 'deny', risk, reason: 'You have turned this tool off in Settings.' };
  if (risk === 'destructive') {
    const bulk = input.risk === 'write';
    return {
      decision: 'ask',
      risk,
      reason: bulk
        ? `This changes ${items} items at once, so it needs your approval.`
        : 'This cannot be done without your approval.',
    };
  }
  if (input.permanent)
    return {
      decision: 'ask',
      risk,
      reason: 'This is recorded permanently as evidence of what you know, and cannot be undone.',
    };
  if (input.override === 'ask')
    return { decision: 'ask', risk, reason: 'You asked to approve this tool each time.' };
  return { decision: 'approve', risk, reason: null };
}
