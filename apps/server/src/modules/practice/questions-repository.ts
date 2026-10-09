import {
  type QuestionAnswer,
  QuestionAnswerSchema,
  type QuestionKind,
  type QuestionStatus,
} from '@skb/core';
import type { SqlDatabase, SqlValue } from '../../db/sqlite';

/** SQL for questions and their concept links (migration 0009). */

export interface QuestionRow {
  id: string;
  kind: QuestionKind;
  stem: string;
  answer: QuestionAnswer;
  rubric: string;
  explanation: string;
  hint: string;
  difficulty: number;
  status: QuestionStatus;
  moduleId: string | null;
  lectureId: string | null;
  tags: string[];
  locatorJson: string | null;
  createdBy: 'user' | 'ai' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface QuestionFilter {
  moduleId?: string;
  lectureId?: string;
  conceptId?: string;
  kind?: QuestionKind;
  status?: QuestionStatus;
}

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

const toQuestion = (raw: Raw): QuestionRow => ({
  id: String(raw.id),
  kind: raw.kind as QuestionKind,
  stem: String(raw.stem),
  answer: QuestionAnswerSchema.parse(JSON.parse(String(raw.answer_json))),
  rubric: String(raw.rubric),
  explanation: String(raw.explanation),
  hint: String(raw.hint),
  difficulty: Number(raw.difficulty),
  status: raw.status as QuestionStatus,
  moduleId: text(raw.module_id),
  lectureId: text(raw.lecture_id),
  tags: JSON.parse(String(raw.tags_json)) as string[],
  locatorJson: text(raw.locator_json),
  createdBy: raw.created_by as QuestionRow['createdBy'],
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

const json = (values: readonly string[]) => JSON.stringify(values);

export type QuestionsRepository = ReturnType<typeof createQuestionsRepository>;

export function createQuestionsRepository(db: SqlDatabase) {
  const columns = (row: QuestionRow): SqlValue[] => [
    row.kind,
    row.stem,
    JSON.stringify(row.answer),
    row.rubric,
    row.explanation,
    row.hint,
    row.difficulty,
    row.status,
    row.moduleId,
    row.lectureId,
    JSON.stringify(row.tags),
    row.locatorJson,
  ];

  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    list(filter: QuestionFilter): QuestionRow[] {
      const where: string[] = [];
      const params: SqlValue[] = [];
      if (filter.status) {
        where.push('q.status = ?');
        params.push(filter.status);
      } else where.push(`q.status != 'deleted'`);
      if (filter.moduleId) {
        where.push('q.module_id = ?');
        params.push(filter.moduleId);
      }
      if (filter.lectureId) {
        where.push('q.lecture_id = ?');
        params.push(filter.lectureId);
      }
      if (filter.kind) {
        where.push('q.kind = ?');
        params.push(filter.kind);
      }
      if (filter.conceptId) {
        where.push(
          'EXISTS (SELECT 1 FROM question_concepts qc WHERE qc.question_id = q.id AND qc.concept_id = ?)',
        );
        params.push(filter.conceptId);
      }
      return db
        .all<Raw>(
          `SELECT q.* FROM questions q WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC, q.id`,
          params,
        )
        .map(toQuestion);
    },
    get(id: string): QuestionRow | null {
      const raw = db.get<Raw>(`SELECT * FROM questions WHERE id = ? AND status != 'deleted'`, [id]);
      return raw ? toQuestion(raw) : null;
    },
    /** Including deleted ones: answers and quizzes still show what they asked. */
    byIds(ids: readonly string[]): Map<string, QuestionRow> {
      return new Map(
        db
          .all<Raw>('SELECT * FROM questions WHERE id IN (SELECT value FROM json_each(?))', [
            json(ids),
          ])
          .map((raw) => {
            const row = toQuestion(raw);
            return [row.id, row];
          }),
      );
    },
    insert(row: QuestionRow): void {
      db.run(
        `INSERT INTO questions (kind, stem, answer_json, rubric, explanation, hint, difficulty, status,
           module_id, lecture_id, tags_json, locator_json, id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...columns(row), row.id, row.createdBy, row.createdAt, row.updatedAt],
      );
    },
    update(row: QuestionRow): void {
      db.run(
        `UPDATE questions SET kind = ?, stem = ?, answer_json = ?, rubric = ?, explanation = ?,
           hint = ?, difficulty = ?, status = ?, module_id = ?, lecture_id = ?, tags_json = ?,
           locator_json = ?, updated_at = ? WHERE id = ?`,
        [...columns(row), row.updatedAt, row.id],
      );
    },

    conceptsOf(questionIds: readonly string[]): Map<string, { id: string; name: string }[]> {
      const map = new Map<string, { id: string; name: string }[]>();
      for (const raw of db.all<Raw>(
        `SELECT qc.question_id, c.id, c.name FROM question_concepts qc
         JOIN concepts c ON c.id = qc.concept_id
         WHERE qc.question_id IN (SELECT value FROM json_each(?)) ORDER BY c.name_key`,
        [json(questionIds)],
      )) {
        const list = map.get(String(raw.question_id)) ?? [];
        list.push({ id: String(raw.id), name: String(raw.name) });
        map.set(String(raw.question_id), list);
      }
      return map;
    },
    setConcepts(questionId: string, conceptIds: readonly string[]): void {
      db.run('DELETE FROM question_concepts WHERE question_id = ?', [questionId]);
      for (const conceptId of conceptIds)
        db.run('INSERT INTO question_concepts (question_id, concept_id) VALUES (?, ?)', [
          questionId,
          conceptId,
        ]);
    },
    existingConcepts: (ids: readonly string[]): Set<string> =>
      new Set(
        db
          .all<{ id: string }>(
            'SELECT id FROM concepts WHERE id IN (SELECT value FROM json_each(?))',
            [json(ids)],
          )
          .map((row) => row.id),
      ),

    /** Scored answers per question, with the latest score. */
    stats(
      questionIds: readonly string[],
    ): Map<string, { answers: number; lastScore: number | null; lastAnsweredAt: string | null }> {
      const map = new Map<
        string,
        { answers: number; lastScore: number | null; lastAnsweredAt: string | null }
      >();
      for (const raw of db.all<Raw>(
        `SELECT question_id, count(*) AS n, max(answered_at) AS last,
           (SELECT a2.score FROM answers a2 WHERE a2.question_id = a.question_id AND a2.score IS NOT NULL
            ORDER BY a2.answered_at DESC, a2.id DESC LIMIT 1) AS last_score
         FROM answers a WHERE a.score IS NOT NULL
           AND a.question_id IN (SELECT value FROM json_each(?))
         GROUP BY question_id`,
        [json(questionIds)],
      ))
        map.set(String(raw.question_id), {
          answers: Number(raw.n),
          lastScore: raw.last_score === null ? null : Number(raw.last_score),
          lastAnsweredAt: text(raw.last),
        });
      return map;
    },

    /** Active questions with their concepts, for building quizzes and Learn sessions. */
    pool(): { row: QuestionRow; conceptIds: string[] }[] {
      const rows = db
        .all<Raw>(`SELECT * FROM questions WHERE status = 'active' ORDER BY created_at, id`)
        .map(toQuestion);
      const links = new Map<string, string[]>();
      for (const raw of db.all<Raw>(
        `SELECT qc.question_id, qc.concept_id FROM question_concepts qc
         JOIN questions q ON q.id = qc.question_id AND q.status = 'active'`,
      ))
        links.set(String(raw.question_id), [
          ...(links.get(String(raw.question_id)) ?? []),
          String(raw.concept_id),
        ]);
      return rows.map((row) => ({ row, conceptIds: links.get(row.id) ?? [] }));
    },

    /** Which modules and topics each active concept belongs to. */
    memberships(): Map<string, { modules: string[]; topics: string[] }> {
      const map = new Map<string, { modules: string[]; topics: string[] }>();
      const entry = (id: string) => {
        let value = map.get(id);
        if (!value) {
          value = { modules: [], topics: [] };
          map.set(id, value);
        }
        return value;
      };
      for (const raw of db.all<Raw>('SELECT concept_id, module_id FROM concept_modules'))
        entry(String(raw.concept_id)).modules.push(String(raw.module_id));
      for (const raw of db.all<Raw>(
        'SELECT ct.concept_id, ct.topic_id, t.module_id FROM concept_topics ct JOIN topics t ON t.id = ct.topic_id',
      )) {
        const value = entry(String(raw.concept_id));
        value.topics.push(String(raw.topic_id));
        // A concept in a module's topic belongs to the module too.
        if (!value.modules.includes(String(raw.module_id)))
          value.modules.push(String(raw.module_id));
      }
      return map;
    },
    topics: (): { id: string; parentId: string | null; moduleId: string }[] =>
      db.all<Raw>('SELECT id, parent_id, module_id FROM topics').map((raw) => ({
        id: String(raw.id),
        parentId: text(raw.parent_id),
        moduleId: String(raw.module_id),
      })),
    concepts: (ids: readonly string[]): { id: string; name: string }[] =>
      db
        .all<Raw>(
          `SELECT id, name FROM concepts WHERE status = 'active'
             AND id IN (SELECT value FROM json_each(?)) ORDER BY name_key`,
          [json(ids)],
        )
        .map((raw) => ({ id: String(raw.id), name: String(raw.name) })),
  };
}
