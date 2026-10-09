import { type Schedule, ScheduleSchema } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/**
 * The evidence mastery is computed from (learning-system.md §7): reviewed card faces, scored
 * answers, what is linked to each concept, recent lapses and the schedules faces had a fortnight
 * ago — plus the derived mastery_cache (migration 0009). Only active cards, questions that still
 * exist and active concepts count.
 */

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const parseSchedule = (value: unknown): Schedule => ScheduleSchema.parse(JSON.parse(String(value)));

/** A review that has not been taken back by an undo row. */
const STANDING = `l.kind = 'review' AND NOT EXISTS (SELECT 1 FROM review_logs u WHERE u.undoes = l.id)`;

export interface ConceptInfo {
  id: string;
  name: string;
  importance: number;
}

export interface AnswerEvidenceRow {
  conceptId: string;
  questionId: string;
  stem: string;
  score: number;
  assisted: boolean;
  answeredAt: string;
}

export interface ItemCounts {
  cards: number;
  cardsPractised: number;
  questions: number;
  questionsPractised: number;
}

export interface CacheRow {
  entityType: 'concept' | 'topic' | 'module' | 'course';
  entityId: string;
  score: number | null;
  stage: string | null;
  confidence: string | null;
  components: unknown;
}

export type MasteryRepository = ReturnType<typeof createMasteryRepository>;

export function createMasteryRepository(db: SqlDatabase) {
  return {
    concepts: (): ConceptInfo[] =>
      db
        .all<Raw>(
          `SELECT id, name, importance FROM concepts WHERE status = 'active' ORDER BY name_key`,
        )
        .map((raw) => ({
          id: String(raw.id),
          name: String(raw.name),
          importance: Number(raw.importance),
        })),

    /** Reviewed faces of active cards, by concept. */
    faces: (): { conceptId: string; face: string; schedule: Schedule }[] =>
      db
        .all<Raw>(
          `SELECT cc.concept_id, cs.card_id, cs.ordinal, cs.schedule_json FROM card_concepts cc
           JOIN cards c ON c.id = cc.card_id AND c.status = 'active'
           JOIN card_schedules cs ON cs.card_id = c.id AND cs.retired = 0 AND cs.state != 'new'`,
        )
        .map((raw) => ({
          conceptId: String(raw.concept_id),
          face: `${raw.card_id}:${raw.ordinal}`,
          schedule: parseSchedule(raw.schedule_json),
        })),

    /** Scored answers to questions that still exist, by concept, newest first. */
    answers: (): AnswerEvidenceRow[] =>
      db
        .all<Raw>(
          `SELECT qc.concept_id, a.question_id, q.stem, a.score, a.assisted, a.answered_at
           FROM answers a
           JOIN questions q ON q.id = a.question_id AND q.status != 'deleted'
           JOIN question_concepts qc ON qc.question_id = a.question_id
           WHERE a.score IS NOT NULL
           ORDER BY a.answered_at DESC, a.rowid DESC`,
        )
        .map((raw) => ({
          conceptId: String(raw.concept_id),
          questionId: String(raw.question_id),
          stem: String(raw.stem),
          score: Number(raw.score),
          assisted: Number(raw.assisted) === 1,
          answeredAt: String(raw.answered_at),
        })),

    /** Cards and questions linked to each concept, and how many were ever practised. */
    items(): Map<string, ItemCounts> {
      const map = new Map<string, ItemCounts>();
      for (const raw of db.all<Raw>(
        `SELECT k.id,
           (SELECT count(*) FROM card_concepts cc JOIN cards c ON c.id = cc.card_id AND c.status = 'active'
            WHERE cc.concept_id = k.id) AS cards,
           (SELECT count(*) FROM card_concepts cc JOIN cards c ON c.id = cc.card_id AND c.status = 'active'
            WHERE cc.concept_id = k.id AND EXISTS (SELECT 1 FROM card_schedules cs
              WHERE cs.card_id = c.id AND cs.retired = 0 AND cs.state != 'new')) AS cards_practised,
           (SELECT count(*) FROM question_concepts qc JOIN questions q ON q.id = qc.question_id
              AND q.status = 'active' WHERE qc.concept_id = k.id) AS questions,
           (SELECT count(*) FROM question_concepts qc JOIN questions q ON q.id = qc.question_id
              AND q.status = 'active' WHERE qc.concept_id = k.id AND EXISTS (SELECT 1 FROM answers a
              WHERE a.question_id = q.id AND a.score IS NOT NULL)) AS questions_practised
         FROM concepts k WHERE k.status = 'active'`,
      ))
        map.set(String(raw.id), {
          cards: Number(raw.cards),
          cardsPractised: Number(raw.cards_practised),
          questions: Number(raw.questions),
          questionsPractised: Number(raw.questions_practised),
        });
      return map;
    },

    /** Faces rated Again while in review since `since`, by concept. */
    lapses(since: string): Map<string, number> {
      return new Map(
        db
          .all<Raw>(
            `SELECT cc.concept_id, count(*) AS n FROM review_logs l
             JOIN cards c ON c.id = l.card_id AND c.status = 'active'
             JOIN card_concepts cc ON cc.card_id = l.card_id
             WHERE ${STANDING} AND l.rating = 1 AND l.reviewed_at >= ?
               AND json_extract(l.previous_json, '$.state') = 'review'
             GROUP BY cc.concept_id`,
            [since],
          )
          .map((raw) => [String(raw.concept_id), Number(raw.n)]),
      );
    },

    /**
     * For faces reviewed after `at`, the schedule each had at `at` (after its last review by then),
     * or null when it was first reviewed later. Other faces still have the schedule they had then.
     */
    schedulesBefore(at: string): Map<string, Schedule | null> {
      const result = new Map<string, Schedule | null>();
      for (const raw of db.all<Raw>(
        `SELECT DISTINCT l.card_id, l.ordinal FROM review_logs l
         WHERE ${STANDING} AND l.reviewed_at > ?`,
        [at],
      ))
        result.set(`${raw.card_id}:${raw.ordinal}`, null);
      if (result.size === 0) return result;
      for (const raw of db.all<Raw>(
        `SELECT r.card_id, r.ordinal, r.next_json FROM (
           SELECT l.card_id, l.ordinal, l.next_json, ROW_NUMBER() OVER (
             PARTITION BY l.card_id, l.ordinal ORDER BY l.reviewed_at DESC, l.rowid DESC) AS n
           FROM review_logs l WHERE ${STANDING} AND l.reviewed_at <= ?
             AND l.card_id IN (SELECT card_id FROM review_logs WHERE reviewed_at > ?)) r
         WHERE r.n = 1`,
        [at, at],
      )) {
        const face = `${raw.card_id}:${raw.ordinal}`;
        if (result.has(face)) result.set(face, parseSchedule(raw.next_json));
      }
      return result;
    },

    modules: (): { id: string; code: string; title: string; credits: number | null }[] =>
      db
        .all<Raw>(
          'SELECT id, code, title, credits FROM modules WHERE archived = 0 ORDER BY code_key',
        )
        .map((raw) => ({
          id: String(raw.id),
          code: String(raw.code),
          title: String(raw.title),
          credits: raw.credits === null ? null : Number(raw.credits),
        })),
    /** Assessments still to come (planned), in modules that are not archived. */
    assessments: () =>
      db
        .all<Raw>(
          `SELECT a.id, a.module_id, a.title, a.weight, a.due_at FROM assessments a
           JOIN modules m ON m.id = a.module_id AND m.archived = 0 WHERE a.status = 'planned'`,
        )
        .map((raw) => ({
          id: String(raw.id),
          moduleId: String(raw.module_id),
          title: String(raw.title),
          weight: Number(raw.weight),
          dueAt: text(raw.due_at),
        })),
    topics: (): { id: string; moduleId: string; parentId: string | null; title: string }[] =>
      db
        .all<Raw>('SELECT id, module_id, parent_id, title FROM topics ORDER BY ordinal, title')
        .map((raw) => ({
          id: String(raw.id),
          moduleId: String(raw.module_id),
          parentId: text(raw.parent_id),
          title: String(raw.title),
        })),
    conceptModules: (): { conceptId: string; moduleId: string }[] =>
      db
        .all<Raw>(
          `SELECT concept_id, module_id FROM concept_modules
           UNION SELECT ct.concept_id, t.module_id FROM concept_topics ct JOIN topics t ON t.id = ct.topic_id`,
        )
        .map((raw) => ({ conceptId: String(raw.concept_id), moduleId: String(raw.module_id) })),
    conceptTopics: (): { conceptId: string; topicId: string }[] =>
      db
        .all<Raw>('SELECT concept_id, topic_id FROM concept_topics')
        .map((raw) => ({ conceptId: String(raw.concept_id), topicId: String(raw.topic_id) })),

    /** Replaces the derived cache in one go. */
    writeCache(rows: readonly CacheRow[], computedAt: string): void {
      db.transaction(() => {
        db.run('DELETE FROM mastery_cache');
        for (const row of rows)
          db.run(
            `INSERT INTO mastery_cache (entity_type, entity_id, score, stage, confidence,
               components_json, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              row.entityType,
              row.entityId,
              row.score,
              row.stage,
              row.confidence,
              JSON.stringify(row.components),
              computedAt,
            ],
          );
      });
    },
  };
}
