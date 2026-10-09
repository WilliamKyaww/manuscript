import type { JobStatus, JobSummary } from '@skb/core';
import type { SqlDatabase } from '../db/sqlite';

/** SQL for the `jobs` table (migration 0005). */

export interface JobRow extends JobSummary {
  payloadJson: string;
  maxAttempts: number;
  runAfter: string;
  finishedAt: string | null;
}

export interface NewJob {
  id: string;
  kind: string;
  subject: string | null;
  payloadJson: string;
  maxAttempts: number;
  runAfter: string;
  now: string;
}

type Raw = Record<string, unknown>;

const COLUMNS = `id, kind, subject, payload_json, status, progress, message, error, attempts,
  max_attempts, run_after, created_at, updated_at, finished_at`;

function toRow(raw: Raw): JobRow {
  return {
    id: String(raw.id),
    kind: String(raw.kind),
    subject: (raw.subject as string | null) ?? null,
    payloadJson: String(raw.payload_json),
    status: raw.status as JobStatus,
    progress: Number(raw.progress),
    message: (raw.message as string | null) ?? null,
    error: (raw.error as string | null) ?? null,
    attempts: Number(raw.attempts),
    maxAttempts: Number(raw.max_attempts),
    runAfter: String(raw.run_after),
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
    finishedAt: (raw.finished_at as string | null) ?? null,
  };
}

export function toJobSummary(row: JobRow): JobSummary {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
    progress: row.progress,
    message: row.message,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type JobsRepository = ReturnType<typeof createJobsRepository>;

export function createJobsRepository(db: SqlDatabase) {
  const byId = (id: string): JobRow | null => {
    const raw = db.get<Raw>(`SELECT ${COLUMNS} FROM jobs WHERE id = ?`, [id]);
    return raw ? toRow(raw) : null;
  };

  return {
    byId,

    insert(job: NewJob): JobRow {
      db.run(
        `INSERT INTO jobs (id, kind, subject, payload_json, status, max_attempts, run_after, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
        [
          job.id,
          job.kind,
          job.subject,
          job.payloadJson,
          job.maxAttempts,
          job.runAfter,
          job.now,
          job.now,
        ],
      );
      return byId(job.id) as JobRow;
    },

    /** A queued job of this kind for this subject, if one is waiting. */
    queuedFor(kind: string, subject: string): JobRow | null {
      const raw = db.get<Raw>(
        `SELECT ${COLUMNS} FROM jobs WHERE kind = ? AND subject = ? AND status = 'queued'
         ORDER BY created_at LIMIT 1`,
        [kind, subject],
      );
      return raw ? toRow(raw) : null;
    },

    /** Moves a queued job's start earlier (never later). */
    bringForward(id: string, runAfter: string, now: string): void {
      db.run(
        `UPDATE jobs SET run_after = ?, updated_at = ? WHERE id = ? AND status = 'queued' AND run_after > ?`,
        [runAfter, now, id, runAfter],
      );
    },

    /** The newest job for each of these subjects that is queued or running. */
    activeFor(subjects: readonly string[]): Map<string, JobRow> {
      const result = new Map<string, JobRow>();
      if (subjects.length === 0) return result;
      const rows = db.all<Raw>(
        `SELECT ${COLUMNS} FROM jobs
         WHERE status IN ('queued', 'running')
           AND subject IN (SELECT value FROM json_each(?))
         ORDER BY created_at`,
        [JSON.stringify(subjects)],
      );
      for (const raw of rows) {
        const row = toRow(raw);
        if (row.subject) result.set(row.subject, row);
      }
      return result;
    },

    /**
     * Marks the next due job of one of `kinds` as running and returns it (one statement, so no job
     * runs twice). Kinds without a handler — e.g. queued by a newer version — are left alone.
     */
    claimNext(now: string, kinds: readonly string[]): JobRow | null {
      const raw = db.get<Raw>(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ?, error = NULL
         WHERE id = (
           SELECT id FROM jobs
           WHERE status = 'queued' AND run_after <= ?
             AND kind IN (SELECT value FROM json_each(?))
           ORDER BY run_after, created_at
           LIMIT 1)
         RETURNING ${COLUMNS}`,
        [now, now, JSON.stringify(kinds)],
      );
      return raw ? toRow(raw) : null;
    },

    /** The earliest `run_after` of any queued job of one of `kinds`. */
    nextRunAfter(kinds: readonly string[]): string | null {
      const raw = db.get<{ next: string | null }>(
        `SELECT min(run_after) AS next FROM jobs
         WHERE status = 'queued' AND kind IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(kinds)],
      );
      return raw?.next ?? null;
    },

    progress(id: string, progress: number, message: string | null, now: string): void {
      db.run(`UPDATE jobs SET progress = ?, message = ?, updated_at = ? WHERE id = ?`, [
        progress,
        message,
        now,
        id,
      ]);
    },

    finish(
      id: string,
      status: Extract<JobStatus, 'succeeded' | 'failed' | 'cancelled'>,
      error: string | null,
      now: string,
    ): void {
      db.run(
        `UPDATE jobs SET status = ?, error = ?, finished_at = ?, updated_at = ?,
           progress = CASE WHEN ? = 'succeeded' THEN 1 ELSE progress END,
           message = CASE WHEN ? = 'succeeded' THEN NULL ELSE message END
         WHERE id = ?`,
        [status, error, now, now, status, status, id],
      );
    },

    /** Puts a job back in the queue (retry after a failure, or after an interrupted run). */
    requeue(
      id: string,
      runAfter: string,
      error: string | null,
      now: string,
      refundAttempt: boolean,
    ): void {
      db.run(
        `UPDATE jobs SET status = 'queued', run_after = ?, error = ?, updated_at = ?, message = NULL,
           attempts = attempts - ?
         WHERE id = ?`,
        [runAfter, error, now, refundAttempt ? 1 : 0, id],
      );
    },

    cancelQueued(id: string, now: string): boolean {
      return (
        db.run(
          `UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ?
           WHERE id = ? AND status = 'queued'`,
          [now, now, id],
        ).changes > 0
      );
    },

    /** Jobs left running by a process that stopped without finishing them. */
    recoverInterrupted(now: string): number {
      return db.run(
        `UPDATE jobs SET status = 'queued', attempts = max(attempts - 1, 0), updated_at = ?
         WHERE status = 'running'`,
        [now],
      ).changes;
    },

    /** Deletes finished jobs that finished before `before`. */
    purgeFinished(before: string): number {
      return db.run(
        `DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled') AND finished_at < ?`,
        [before],
      ).changes;
    },
  };
}
