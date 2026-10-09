import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Json } from './types';

/**
 * Approvals bound to their arguments (agent-system.md §7). When a call needs the person's approval,
 * granting it produces a token that is the HMAC of the tool's name and its arguments under a secret
 * that lives only in this process. The registry refuses to run the call without a token that
 * matches, so what ran is exactly what was approved: arguments changed between the approval and the
 * execution, or text in a source pretending to be an approval, produce no valid token.
 */

/** JSON with keys in a fixed order, so equal arguments always sign alike. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

export interface Approvals {
  /** The token for approving this tool with these arguments. */
  grant(tool: string, input: Json | unknown): string;
  verify(tool: string, input: Json | unknown, token: string | undefined): boolean;
}

export function createApprovals(secret: Buffer = randomBytes(32)): Approvals {
  const sign = (tool: string, input: unknown) =>
    createHmac('sha256', secret)
      .update(`${tool}\n${canonical(input)}`)
      .digest('hex');
  return {
    grant: sign,
    verify(tool, input, token) {
      if (!token) return false;
      const expected = Buffer.from(sign(tool, input));
      const given = Buffer.from(token);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}
