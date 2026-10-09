import type { AiRole } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for `ai_usage` (migration 0010): what each request cost, for budgets and the usage report. */

export interface UsageRecord {
  id: string;
  role: AiRole;
  provider: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
}

export interface Totals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

type Raw = Record<string, unknown>;

const totals = (raw: Raw | undefined): Totals => ({
  requests: Number(raw?.requests ?? 0),
  inputTokens: Number(raw?.input_tokens ?? 0),
  outputTokens: Number(raw?.output_tokens ?? 0),
  cost: Number(raw?.cost ?? 0),
});

const SUMS = `count(*) AS requests, coalesce(sum(input_tokens), 0) AS input_tokens,
  coalesce(sum(output_tokens), 0) AS output_tokens, coalesce(sum(cost_estimate), 0) AS cost`;

export type UsageRepository = ReturnType<typeof createUsageRepository>;

export function createUsageRepository(db: SqlDatabase) {
  return {
    insert(record: UsageRecord): void {
      db.run(
        `INSERT INTO ai_usage (id, role, provider, model, purpose, input_tokens, output_tokens,
           cost_estimate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.role,
          record.provider,
          record.model,
          record.purpose,
          record.inputTokens,
          record.outputTokens,
          record.cost,
          record.createdAt,
        ],
      );
    },
    since: (from: string): Totals =>
      totals(db.get<Raw>(`SELECT ${SUMS} FROM ai_usage WHERE created_at >= ?`, [from])),
    byModel: (from: string) =>
      db
        .all<Raw>(
          `SELECT role, provider, model, ${SUMS} FROM ai_usage WHERE created_at >= ?
           GROUP BY role, provider, model ORDER BY cost DESC, requests DESC`,
          [from],
        )
        .map((raw) => ({
          role: raw.role as AiRole,
          provider: String(raw.provider),
          model: String(raw.model),
          ...totals(raw),
        })),
    recent: (limit: number): UsageRecord[] =>
      db
        .all<Raw>('SELECT * FROM ai_usage ORDER BY created_at DESC, id DESC LIMIT ?', [limit])
        .map((raw) => ({
          id: String(raw.id),
          role: raw.role as AiRole,
          provider: String(raw.provider),
          model: String(raw.model),
          purpose: String(raw.purpose),
          inputTokens: Number(raw.input_tokens),
          outputTokens: Number(raw.output_tokens),
          cost: Number(raw.cost_estimate),
          createdAt: String(raw.created_at),
        })),
  };
}
