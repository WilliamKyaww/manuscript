import {
  type AskFilter,
  AskFilterSchema,
  type AskScope,
  type ChatMessage,
  type ChatMode,
  type ChatPart,
  ChatPartSchema,
  type Mention,
  MentionSchema,
} from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';
import type { ConversationMessage } from '../agent/runner';

/** SQL for `chat_threads` and `chat_messages` (migration 0013). */

/** What a paused run needs to carry on once the person has answered. */
export const PendingSchema = z.object({
  assistantMessageId: z.string(),
  calls: z.array(
    z.object({
      approvalId: z.string(),
      callId: z.string(),
      tool: z.string(),
      summary: z.string(),
      risk: z.enum(['read', 'write', 'destructive']),
      reason: z.string(),
      input: z.unknown(),
    }),
  ),
  approvedCalls: z.array(z.string()),
  steps: z.number().int(),
  /** The instructions and page context of the run, so a resumed run is told the same. */
  context: z.string().optional(),
  instructions: z.string().default(''),
  /** Where the person's message is in the history, and what they asked (without the passages). */
  userIndex: z.number().int().default(0),
  request: z.string().default(''),
});
export type Pending = z.infer<typeof PendingSchema>;

export interface ThreadRow {
  id: string;
  title: string;
  mode: ChatMode;
  scope: AskScope;
  filter: AskFilter;
  allowedTools: string[];
  history: ConversationMessage[];
  summary: string;
  pending: Pending | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  assistantCount: number;
}

type Raw = Record<string, unknown>;
const Strings = z.array(z.string());
const Parts = z.array(ChatPartSchema);
const Mentions = z.array(MentionSchema);

const COLUMNS = `t.*, (SELECT count(*) FROM chat_messages m WHERE m.thread_id = t.id) AS message_count,
  (SELECT count(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.role = 'assistant') AS assistant_count`;

const toThread = (raw: Raw): ThreadRow => ({
  id: String(raw.id),
  title: String(raw.title),
  mode: raw.mode as ChatMode,
  scope: raw.scope as AskScope,
  filter: AskFilterSchema.parse(JSON.parse(String(raw.filter_json))),
  allowedTools: Strings.parse(JSON.parse(String(raw.allowed_tools_json))),
  history: JSON.parse(String(raw.history_json)) as ConversationMessage[],
  summary: String(raw.summary),
  pending: raw.pending_json ? PendingSchema.parse(JSON.parse(String(raw.pending_json))) : null,
  inputTokens: Number(raw.input_tokens),
  outputTokens: Number(raw.output_tokens),
  cost: Number(raw.cost),
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
  messageCount: Number(raw.message_count ?? 0),
  assistantCount: Number(raw.assistant_count ?? 0),
});

export interface MessageRow {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  parts: ChatPart[];
  mentions: Mention[];
  createdAt: string;
}

const toMessage = (raw: Raw): MessageRow => ({
  id: String(raw.id),
  threadId: String(raw.thread_id),
  role: raw.role as MessageRow['role'],
  parts: Parts.parse(JSON.parse(String(raw.parts_json))),
  mentions: Mentions.parse(JSON.parse(String(raw.mentions_json))),
  createdAt: String(raw.created_at),
});

export const messageView = (row: MessageRow): ChatMessage => ({
  id: row.id as ChatMessage['id'],
  role: row.role,
  parts: row.parts,
  mentions: row.mentions,
  createdAt: row.createdAt,
});

/** The words of a message, for finding the conversation again. */
export const plainText = (parts: readonly ChatPart[]) =>
  parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');

const like = (text: string) => `%${text.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;

export type ChatRepository = ReturnType<typeof createChatRepository>;

export function createChatRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    threads(query?: string): ThreadRow[] {
      const needle = query?.trim();
      const rows = needle
        ? db.all<Raw>(
            `SELECT ${COLUMNS} FROM chat_threads t
             WHERE t.title LIKE ? ESCAPE '\\'
                OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id = t.id AND m.text LIKE ? ESCAPE '\\')
             ORDER BY t.updated_at DESC, t.rowid DESC`,
            [like(needle), like(needle)],
          )
        : db.all<Raw>(
            `SELECT ${COLUMNS} FROM chat_threads t ORDER BY t.updated_at DESC, t.rowid DESC`,
          );
      return rows.map(toThread);
    },

    thread(id: string): ThreadRow | null {
      const raw = db.get<Raw>(`SELECT ${COLUMNS} FROM chat_threads t WHERE t.id = ?`, [id]);
      return raw ? toThread(raw) : null;
    },

    insertThread(row: {
      id: string;
      title: string;
      mode: ChatMode;
      scope: AskScope;
      filter: AskFilter;
      at: string;
    }): void {
      db.run(
        `INSERT INTO chat_threads (id, title, mode, scope, filter_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.title, row.mode, row.scope, JSON.stringify(row.filter), row.at, row.at],
      );
    },

    updateThread(
      id: string,
      patch: Partial<{
        title: string;
        mode: ChatMode;
        scope: AskScope;
        filter: AskFilter;
        allowedTools: string[];
        history: ConversationMessage[];
        summary: string;
        pending: Pending | null;
      }>,
      at: string,
    ): void {
      const sets: string[] = ['updated_at = ?'];
      const params: (string | number | null)[] = [at];
      const put = (column: string, value: string | null) => {
        sets.push(`${column} = ?`);
        params.push(value);
      };
      if (patch.title !== undefined) put('title', patch.title);
      if (patch.mode !== undefined) put('mode', patch.mode);
      if (patch.scope !== undefined) put('scope', patch.scope);
      if (patch.filter !== undefined) put('filter_json', JSON.stringify(patch.filter));
      if (patch.allowedTools !== undefined)
        put('allowed_tools_json', JSON.stringify(patch.allowedTools));
      if (patch.history !== undefined) put('history_json', JSON.stringify(patch.history));
      if (patch.summary !== undefined) put('summary', patch.summary);
      if (patch.pending !== undefined)
        put('pending_json', patch.pending === null ? null : JSON.stringify(patch.pending));
      db.run(`UPDATE chat_threads SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    },

    addUsage(id: string, inputTokens: number, outputTokens: number, cost: number): void {
      db.run(
        `UPDATE chat_threads SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?,
           cost = cost + ? WHERE id = ?`,
        [inputTokens, outputTokens, cost, id],
      );
    },

    removeThread(id: string): void {
      db.run('DELETE FROM chat_threads WHERE id = ?', [id]);
    },

    messages(threadId: string): MessageRow[] {
      return db
        .all<Raw>('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at, rowid', [
          threadId,
        ])
        .map(toMessage);
    },

    message(id: string): MessageRow | null {
      const raw = db.get<Raw>('SELECT * FROM chat_messages WHERE id = ?', [id]);
      return raw ? toMessage(raw) : null;
    },

    insertMessage(row: MessageRow): void {
      db.run(
        `INSERT INTO chat_messages (id, thread_id, role, parts_json, mentions_json, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.threadId,
          row.role,
          JSON.stringify(row.parts),
          JSON.stringify(row.mentions),
          plainText(row.parts),
          row.createdAt,
        ],
      );
    },

    updateMessage(id: string, parts: readonly ChatPart[]): void {
      db.run('UPDATE chat_messages SET parts_json = ?, text = ? WHERE id = ?', [
        JSON.stringify(parts),
        plainText(parts),
        id,
      ]);
    },
  };
}
