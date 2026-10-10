import { type PlanItemKind, type Schedule, ScheduleSchema } from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for study plans and their items (migration 0014), and the figures the planner reads. */

export interface PlanRow {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  params: Record<string, unknown>;
  generatedBy: 'planner' | 'agent';
  unscheduled: { title: string; reason: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemRow {
  id: string;
  planId: string;
  date: string;
  ordinal: number;
  kind: PlanItemKind;
  targetType: 'module' | 'concept' | 'lecture' | 'assessment' | 'cards' | null;
  targetId: string | null;
  title: string;
  minutes: number;
  reason: string;
  status: 'planned' | 'done' | 'skipped';
  completedAt: string | null;
}

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const Unscheduled = z.array(z.object({ title: z.string(), reason: z.string() }));

const toPlan = (raw: Raw): PlanRow => ({
  id: String(raw.id),
  title: String(raw.title),
  startDate: String(raw.start_date),
  endDate: String(raw.end_date),
  params: JSON.parse(String(raw.params_json)) as Record<string, unknown>,
  generatedBy: raw.generated_by as PlanRow['generatedBy'],
  unscheduled: Unscheduled.parse(JSON.parse(String(raw.unscheduled_json))),
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

const toItem = (raw: Raw): ItemRow => ({
  id: String(raw.id),
  planId: String(raw.plan_id),
  date: String(raw.date),
  ordinal: Number(raw.ordinal),
  kind: raw.kind as PlanItemKind,
  targetType: text(raw.target_type) as ItemRow['targetType'],
  targetId: text(raw.target_id),
  title: String(raw.title),
  minutes: Number(raw.minutes),
  reason: String(raw.reason),
  status: raw.status as ItemRow['status'],
  completedAt: text(raw.completed_at),
});

/** A card face of a module, for the forecast of what will have been forgotten by an exam. */
export interface ModuleFace {
  moduleId: string;
  schedule: Schedule;
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;

export function createPlanRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    /** The newest plan: the one the student is following. */
    current(): PlanRow | null {
      const raw = db.get<Raw>(
        'SELECT * FROM study_plans ORDER BY created_at DESC, rowid DESC LIMIT 1',
      );
      return raw ? toPlan(raw) : null;
    },
    plan(id: string): PlanRow | null {
      const raw = db.get<Raw>('SELECT * FROM study_plans WHERE id = ?', [id]);
      return raw ? toPlan(raw) : null;
    },
    insertPlan(row: PlanRow): void {
      db.run(
        `INSERT INTO study_plans (id, title, start_date, end_date, params_json, generated_by,
                                  unscheduled_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.startDate,
          row.endDate,
          JSON.stringify(row.params),
          row.generatedBy,
          JSON.stringify(row.unscheduled),
          row.createdAt,
          row.updatedAt,
        ],
      );
    },
    updatePlan(
      id: string,
      patch: {
        title?: string;
        startDate?: string;
        endDate?: string;
        params?: Record<string, unknown>;
        generatedBy?: PlanRow['generatedBy'];
        unscheduled?: PlanRow['unscheduled'];
      },
      at: string,
    ): void {
      const current = this.plan(id);
      if (!current) return;
      db.run(
        `UPDATE study_plans SET title = ?, start_date = ?, end_date = ?, params_json = ?,
           generated_by = ?, unscheduled_json = ?, updated_at = ? WHERE id = ?`,
        [
          patch.title ?? current.title,
          patch.startDate ?? current.startDate,
          patch.endDate ?? current.endDate,
          JSON.stringify(patch.params ?? current.params),
          patch.generatedBy ?? current.generatedBy,
          JSON.stringify(patch.unscheduled ?? current.unscheduled),
          at,
          id,
        ],
      );
    },
    removePlan: (id: string) => db.run('DELETE FROM study_plans WHERE id = ?', [id]),

    items: (planId: string): ItemRow[] =>
      db
        .all<Raw>('SELECT * FROM plan_items WHERE plan_id = ? ORDER BY date, ordinal', [planId])
        .map(toItem),
    item(id: string): ItemRow | null {
      const raw = db.get<Raw>('SELECT * FROM plan_items WHERE id = ?', [id]);
      return raw ? toItem(raw) : null;
    },
    insertItem(row: ItemRow): void {
      db.run(
        `INSERT INTO plan_items (id, plan_id, date, ordinal, kind, target_type, target_id, title,
                                 minutes, reason, status, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.planId,
          row.date,
          row.ordinal,
          row.kind,
          row.targetType,
          row.targetId,
          row.title,
          row.minutes,
          row.reason,
          row.status,
          row.completedAt,
        ],
      );
    },
    setStatus: (id: string, status: ItemRow['status'], completedAt: string | null) =>
      db.run('UPDATE plan_items SET status = ?, completed_at = ? WHERE id = ?', [
        status,
        completedAt,
        id,
      ]),
    /** Forgets what is still only planned from `from` onwards, so it can be planned again. */
    removePlanned: (planId: string, from: string) =>
      db.run("DELETE FROM plan_items WHERE plan_id = ? AND status = 'planned' AND date >= ?", [
        planId,
        from,
      ]),
    removeItems: (planId: string) => db.run('DELETE FROM plan_items WHERE plan_id = ?', [planId]),

    // --- What the planner reads -----------------------------------------------------------------

    /** Lectures that already have cards or questions to study from. */
    studiedLectures(): Set<string> {
      return new Set(
        db
          .all<Raw>(
            `SELECT s.lecture_id AS id FROM card_sets s
               JOIN cards c ON c.set_id = s.id AND c.status IN ('active', 'draft')
              WHERE s.lecture_id IS NOT NULL AND s.deleted_at IS NULL
             UNION
             SELECT lecture_id AS id FROM questions
              WHERE lecture_id IS NOT NULL AND status IN ('active', 'draft')`,
          )
          .map((raw) => String(raw.id)),
      );
    },

    /** Live faces already in review, with the module their card set belongs to. */
    moduleFaces(moduleId: string): ModuleFace[] {
      return db
        .all<Raw>(
          `SELECT s.module_id AS module_id, cs.schedule_json AS schedule_json
             FROM card_schedules cs
             JOIN cards c ON c.id = cs.card_id AND c.status = 'active'
             JOIN card_sets s ON s.id = c.set_id AND s.deleted_at IS NULL
            WHERE s.module_id = ? AND cs.retired = 0 AND cs.state IN ('review', 'relearning')`,
          [moduleId],
        )
        .map((raw) => ({
          moduleId: String(raw.module_id),
          schedule: ScheduleSchema.parse(JSON.parse(String(raw.schedule_json))),
        }));
    },

    /** Time per review (milliseconds) over the last `days`, for the student's own pace. */
    reviewDurations(since: string): number[] {
      return db
        .all<Raw>(
          `SELECT duration_ms FROM review_logs
            WHERE kind = 'review' AND duration_ms IS NOT NULL AND duration_ms > 0 AND reviewed_at >= ?`,
          [since],
        )
        .map((raw) => Number(raw.duration_ms));
    },
  };
}
