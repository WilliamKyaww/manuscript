import type { ToolRisk } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import type { Actor, Json } from './types';

/** SQL for `agent_actions` (migration 0012): the log of what the agent did. */

export type ActionStatus = 'executed' | 'denied' | 'failed' | 'undone';

export interface ActionRow {
  id: string;
  threadId: string | null;
  messageId: string | null;
  actor: Actor;
  tool: string;
  risk: ToolRisk;
  approval: 'auto' | 'user' | null;
  status: ActionStatus;
  summary: string;
  input: unknown;
  output: unknown;
  error: string | null;
  undo: Json | null;
  snapshotRef: string | null;
  createdAt: string;
  undoneAt: string | null;
}

type Raw = Record<string, unknown>;
const json = (text: unknown) =>
  text === null || text === undefined ? null : JSON.parse(String(text));
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

const toRow = (raw: Raw): ActionRow => ({
  id: String(raw.id),
  threadId: text(raw.thread_id),
  messageId: text(raw.message_id),
  actor: raw.actor as Actor,
  tool: String(raw.tool),
  risk: raw.risk as ToolRisk,
  approval: (raw.approval as ActionRow['approval']) ?? null,
  status: raw.status as ActionStatus,
  summary: String(raw.summary),
  input: json(raw.input_json),
  output: json(raw.output_json),
  error: text(raw.error),
  undo: json(raw.undo_json),
  snapshotRef: text(raw.snapshot_ref),
  createdAt: String(raw.created_at),
  undoneAt: text(raw.undone_at),
});

export type ActionsRepository = ReturnType<typeof createActionsRepository>;

export function createActionsRepository(db: SqlDatabase) {
  return {
    insert(row: Omit<ActionRow, 'undoneAt'>): void {
      db.run(
        `INSERT INTO agent_actions (id, thread_id, message_id, actor, tool, risk, approval, status,
           summary, input_json, output_json, error, undo_json, snapshot_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.threadId,
          row.messageId,
          row.actor,
          row.tool,
          row.risk,
          row.approval,
          row.status,
          row.summary,
          JSON.stringify(row.input ?? null),
          row.output === undefined ? null : JSON.stringify(row.output),
          row.error,
          row.undo === null ? null : JSON.stringify(row.undo),
          row.snapshotRef,
          row.createdAt,
        ],
      );
    },

    byId(id: string): ActionRow | null {
      const raw = db.get<Raw>('SELECT * FROM agent_actions WHERE id = ?', [id]);
      return raw ? toRow(raw) : null;
    },

    recent(limit: number): ActionRow[] {
      return db
        .all<Raw>('SELECT * FROM agent_actions ORDER BY created_at DESC, rowid DESC LIMIT ?', [
          limit,
        ])
        .map(toRow);
    },

    markUndone(id: string, at: string): void {
      db.run(`UPDATE agent_actions SET status = 'undone', undone_at = ? WHERE id = ?`, [at, id]);
    },
  };
}
