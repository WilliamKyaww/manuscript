import {
  ProposalEvidenceSchema,
  type ProposalKind,
  type ProposalPayload,
  ProposalPayloadSchema,
} from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for `proposals` (migration 0011): what AI proposed, and what the student decided. */

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';
export type Evidence = z.infer<typeof ProposalEvidenceSchema>;

export const OriginSchema = z.object({
  /** "Concepts from CS301 L3 — Consensus". */
  label: z.string(),
  jobId: z.string().nullable().default(null),
  moduleId: z.string().nullable().default(null),
  lectureId: z.string().nullable().default(null),
  /** Where extracted concepts are covered (lecture, source or note). */
  coveredIn: z
    .object({ type: z.enum(['lecture', 'source', 'note']), id: z.string() })
    .nullable()
    .default(null),
});
export type Origin = z.infer<typeof OriginSchema>;

export interface ProposalRow {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  payload: ProposalPayload;
  evidence: Evidence[];
  origin: Origin;
  dedupeKey: string;
  result: { kind: string; id: string } | null;
  createdAt: string;
  decidedAt: string | null;
}

type Raw = Record<string, unknown>;
const Result = z.object({ kind: z.string(), id: z.string() });
const EvidenceList = z.array(ProposalEvidenceSchema);

const toRow = (raw: Raw): ProposalRow => ({
  id: String(raw.id),
  kind: raw.kind as ProposalKind,
  status: raw.status as ProposalStatus,
  payload: ProposalPayloadSchema.parse(JSON.parse(String(raw.payload_json))),
  evidence: EvidenceList.parse(JSON.parse(String(raw.evidence_json))),
  origin: OriginSchema.parse(JSON.parse(String(raw.origin_json))),
  dedupeKey: String(raw.dedupe_key),
  result: raw.result_json ? Result.parse(JSON.parse(String(raw.result_json))) : null,
  createdAt: String(raw.created_at),
  decidedAt: raw.decided_at === null ? null : String(raw.decided_at),
});

export type ProposalsRepository = ReturnType<typeof createProposalsRepository>;

export function createProposalsRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    insert(row: Omit<ProposalRow, 'status' | 'result' | 'decidedAt'>): void {
      db.run(
        `INSERT INTO proposals (id, kind, status, payload_json, evidence_json, origin_json, dedupe_key,
           created_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.kind,
          JSON.stringify(row.payload),
          JSON.stringify(row.evidence),
          JSON.stringify(row.origin),
          row.dedupeKey,
          row.createdAt,
        ],
      );
    },

    byId(id: string): ProposalRow | null {
      const raw = db.get<Raw>('SELECT * FROM proposals WHERE id = ?', [id]);
      return raw ? toRow(raw) : null;
    },

    list(status: ProposalStatus, kind?: ProposalKind, limit = 500): ProposalRow[] {
      return db
        .all<Raw>(
          `SELECT * FROM proposals WHERE status = ? AND (? IS NULL OR kind = ?)
           ORDER BY ${status === 'pending' ? 'created_at, rowid' : 'decided_at DESC, rowid DESC'}
           LIMIT ?`,
          [status, kind ?? null, kind ?? null, limit],
        )
        .map(toRow);
    },

    pendingCount(): number {
      return Number(
        db.get<{ n: number }>(`SELECT count(*) AS n FROM proposals WHERE status = 'pending'`)?.n ??
          0,
      );
    },

    /** The pending proposal with this key, or whether one was rejected (not to propose again). */
    byKey(key: string): { pending: ProposalRow | null; rejected: boolean } {
      const rows = db
        .all<Raw>(
          `SELECT * FROM proposals WHERE dedupe_key = ? AND status IN ('pending', 'rejected')`,
          [key],
        )
        .map(toRow);
      return {
        pending: rows.find((row) => row.status === 'pending') ?? null,
        rejected: rows.some((row) => row.status === 'rejected'),
      };
    },

    decide(
      id: string,
      status: Exclude<ProposalStatus, 'pending'>,
      at: string,
      result: { kind: string; id: string } | null = null,
    ): void {
      db.run(
        `UPDATE proposals SET status = ?, decided_at = ?, result_json = ? WHERE id = ? AND status = 'pending'`,
        [status, at, result ? JSON.stringify(result) : null, id],
      );
    },

    updatePayload(id: string, payload: ProposalPayload): void {
      db.run(`UPDATE proposals SET payload_json = ? WHERE id = ?`, [JSON.stringify(payload), id]);
    },

    /** Pending relation proposals with an end that is the given (concept) proposal. */
    relationsReferring(proposalId: string): ProposalRow[] {
      return db
        .all<Raw>(
          `SELECT * FROM proposals WHERE kind = 'relation' AND status = 'pending'
             AND (json_extract(payload_json, '$.from.proposalId') = ?
               OR json_extract(payload_json, '$.to.proposalId') = ?)`,
          [proposalId, proposalId],
        )
        .map(toRow);
    },
  };
}
