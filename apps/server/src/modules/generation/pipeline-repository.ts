import { type PipelineStepResult, PipelineStepResultSchema } from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for pipeline runs (migration 0015). */

export interface RunRow {
  id: string;
  lectureId: string;
  trigger: 'manual' | 'auto';
  steps: PipelineStepResult[];
  sourceIds: string[];
  jobId: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

type Raw = Record<string, unknown>;
const Steps = z.array(PipelineStepResultSchema);
const Strings = z.array(z.string());

const toRun = (raw: Raw): RunRow => ({
  id: String(raw.id),
  lectureId: String(raw.lecture_id),
  trigger: raw.trigger as RunRow['trigger'],
  steps: Steps.parse(JSON.parse(String(raw.steps_json))),
  sourceIds: Strings.parse(JSON.parse(String(raw.sources_json))),
  jobId: raw.job_id === null ? null : String(raw.job_id),
  status: raw.status as RunRow['status'],
  message: raw.message === null ? null : String(raw.message),
  startedAt: String(raw.started_at),
  finishedAt: raw.finished_at === null ? null : String(raw.finished_at),
});

export type PipelineRepository = ReturnType<typeof createPipelineRepository>;

export function createPipelineRepository(db: SqlDatabase) {
  return {
    insert(row: RunRow): void {
      db.run(
        `INSERT INTO pipeline_runs (id, lecture_id, trigger, steps_json, sources_json, job_id, status,
                                    message, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.lectureId,
          row.trigger,
          JSON.stringify(row.steps),
          JSON.stringify(row.sourceIds),
          row.jobId,
          row.status,
          row.message,
          row.startedAt,
          row.finishedAt,
        ],
      );
    },
    update(
      id: string,
      patch: {
        steps?: PipelineStepResult[];
        status?: RunRow['status'];
        message?: string | null;
        jobId?: string | null;
        finishedAt?: string | null;
      },
    ): void {
      const current = this.run(id);
      if (!current) return;
      db.run(
        `UPDATE pipeline_runs SET steps_json = ?, status = ?, message = ?, job_id = ?, finished_at = ?
          WHERE id = ?`,
        [
          JSON.stringify(patch.steps ?? current.steps),
          patch.status ?? current.status,
          patch.message === undefined ? current.message : patch.message,
          patch.jobId === undefined ? current.jobId : patch.jobId,
          patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
          id,
        ],
      );
    },
    run(id: string): RunRow | null {
      const raw = db.get<Raw>('SELECT * FROM pipeline_runs WHERE id = ?', [id]);
      return raw ? toRun(raw) : null;
    },
    latest(lectureId: string): RunRow | null {
      const raw = db.get<Raw>(
        'SELECT * FROM pipeline_runs WHERE lecture_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1',
        [lectureId],
      );
      return raw ? toRun(raw) : null;
    },
    /** Source ids any earlier run of the lecture already covered. */
    coveredSources(lectureId: string): Set<string> {
      return new Set(
        db
          .all<Raw>('SELECT sources_json FROM pipeline_runs WHERE lecture_id = ?', [lectureId])
          .flatMap((raw) => Strings.parse(JSON.parse(String(raw.sources_json)))),
      );
    },
  };
}
