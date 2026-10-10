import {
  type QuestionResponse,
  type QuizConfig,
  QuizConfigSchema,
  type QuizKind,
  ResponseSchema,
} from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for quizzes, their items, attempts, answers and practice sessions (migration 0009). */

export interface QuizRow {
  id: string;
  title: string;
  kind: QuizKind;
  config: QuizConfig;
  moduleId: string | null;
  assessmentId: string | null;
  createdAt: string;
}

export interface AttemptRow {
  id: string;
  quizId: string;
  startedAt: string;
  deadline: string | null;
  finishedAt: string | null;
  score: number | null;
  draft: Record<string, QuestionResponse>;
  sessionId: string | null;
}

export interface AnswerRow {
  id: string;
  attemptId: string;
  questionId: string;
  conceptId: string | null;
  response: QuestionResponse | null;
  score: number | null;
  gradedBy: 'auto' | 'self' | 'ai' | null;
  gradedAt: string | null;
  /** The grader's comments (a model's, when its grade was accepted). */
  feedback: string;
  confidence: number | null;
  assisted: boolean;
  durationMs: number | null;
  answeredAt: string;
}

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const Draft = z.record(z.string(), ResponseSchema);

const toQuiz = (raw: Raw): QuizRow => ({
  id: String(raw.id),
  title: String(raw.title),
  kind: raw.kind as QuizKind,
  config: QuizConfigSchema.parse(JSON.parse(String(raw.config_json))),
  moduleId: text(raw.module_id),
  assessmentId: text(raw.assessment_id),
  createdAt: String(raw.created_at),
});

const toAttempt = (raw: Raw): AttemptRow => ({
  id: String(raw.id),
  quizId: String(raw.quiz_id),
  startedAt: String(raw.started_at),
  deadline: text(raw.deadline),
  finishedAt: text(raw.finished_at),
  score: number(raw.score),
  draft: raw.draft_json ? Draft.parse(JSON.parse(String(raw.draft_json))) : {},
  sessionId: text(raw.session_id),
});

const toAnswer = (raw: Raw): AnswerRow => ({
  id: String(raw.id),
  attemptId: String(raw.attempt_id),
  questionId: String(raw.question_id),
  conceptId: text(raw.concept_id),
  response: raw.response_json ? ResponseSchema.parse(JSON.parse(String(raw.response_json))) : null,
  score: number(raw.score),
  gradedBy: (raw.graded_by as AnswerRow['gradedBy']) ?? null,
  gradedAt: text(raw.graded_at),
  feedback: String(raw.feedback ?? ''),
  confidence: number(raw.confidence),
  assisted: Number(raw.assisted) === 1,
  durationMs: number(raw.duration_ms),
  answeredAt: String(raw.answered_at),
});

export type AttemptsRepository = ReturnType<typeof createAttemptsRepository>;

export function createAttemptsRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    // --- Quizzes ----------------------------------------------------------------------------
    quizzes: (): QuizRow[] =>
      db
        .all<Raw>(
          `SELECT * FROM quizzes WHERE deleted_at IS NULL AND kind != 'adaptive'
             AND json_extract(config_json, '$.tutor') IS NULL
           ORDER BY created_at DESC, id DESC`,
        )
        .map(toQuiz),
    quiz(id: string, includeDeleted = false): QuizRow | null {
      const raw = db.get<Raw>(
        `SELECT * FROM quizzes WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
        [id],
      );
      return raw ? toQuiz(raw) : null;
    },
    insertQuiz(row: QuizRow, questionIds: readonly string[]): void {
      db.run(
        `INSERT INTO quizzes (id, title, kind, config_json, module_id, assessment_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.kind,
          JSON.stringify(row.config),
          row.moduleId,
          row.assessmentId,
          row.createdAt,
        ],
      );
      questionIds.forEach((questionId, ordinal) => {
        db.run('INSERT INTO quiz_items (quiz_id, ordinal, question_id) VALUES (?, ?, ?)', [
          row.id,
          ordinal,
          questionId,
        ]);
      });
    },
    /** Puts one more question into a quiz (a tutored chat grows its quiz as it asks). */
    addItem(quizId: string, questionId: string): void {
      const next = db.get<{ n: number }>(
        'SELECT coalesce(max(ordinal) + 1, 0) AS n FROM quiz_items WHERE quiz_id = ?',
        [quizId],
      );
      db.run('INSERT INTO quiz_items (quiz_id, ordinal, question_id) VALUES (?, ?, ?)', [
        quizId,
        next?.n ?? 0,
        questionId,
      ]);
    },
    deleteQuiz: (id: string, at: string) =>
      db.run('UPDATE quizzes SET deleted_at = ? WHERE id = ?', [at, id]),
    items: (quizId: string): string[] =>
      db
        .all<Raw>('SELECT question_id FROM quiz_items WHERE quiz_id = ? ORDER BY ordinal', [quizId])
        .map((raw) => String(raw.question_id)),
    itemCounts(): Map<string, number> {
      return new Map(
        db
          .all<Raw>('SELECT quiz_id, count(*) AS n FROM quiz_items GROUP BY quiz_id')
          .map((raw) => [String(raw.quiz_id), Number(raw.n)]),
      );
    },

    // --- Attempts ---------------------------------------------------------------------------
    insertAttempt(row: AttemptRow): void {
      db.run(
        `INSERT INTO quiz_attempts (id, quiz_id, started_at, deadline, session_id)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.quizId, row.startedAt, row.deadline, row.sessionId],
      );
    },
    attempt(id: string): AttemptRow | null {
      const raw = db.get<Raw>('SELECT * FROM quiz_attempts WHERE id = ?', [id]);
      return raw ? toAttempt(raw) : null;
    },
    attemptsOf: (quizIds: readonly string[]): AttemptRow[] =>
      db
        .all<Raw>(
          `SELECT * FROM quiz_attempts WHERE quiz_id IN (SELECT value FROM json_each(?))
           ORDER BY started_at DESC, id DESC`,
          [JSON.stringify(quizIds)],
        )
        .map(toAttempt),
    saveDraft: (id: string, draft: Record<string, QuestionResponse>) =>
      db.run('UPDATE quiz_attempts SET draft_json = ? WHERE id = ?', [JSON.stringify(draft), id]),
    finishAttempt: (id: string, at: string) =>
      db.run(
        'UPDATE quiz_attempts SET finished_at = ?, draft_json = NULL WHERE id = ? AND finished_at IS NULL',
        [at, id],
      ),
    setScore: (id: string, score: number | null) =>
      db.run('UPDATE quiz_attempts SET score = ? WHERE id = ?', [score, id]),

    // --- Answers ----------------------------------------------------------------------------
    insertAnswer(row: AnswerRow): void {
      db.run(
        `INSERT INTO answers (id, attempt_id, question_id, concept_id, response_json, score, graded_by,
           graded_at, confidence, assisted, duration_ms, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.attemptId,
          row.questionId,
          row.conceptId,
          row.response === null ? null : JSON.stringify(row.response),
          row.score,
          row.gradedBy,
          row.gradedAt,
          row.confidence,
          row.assisted ? 1 : 0,
          row.durationMs,
          row.answeredAt,
        ],
      );
    },
    answer(id: string): AnswerRow | null {
      const raw = db.get<Raw>('SELECT * FROM answers WHERE id = ?', [id]);
      return raw ? toAnswer(raw) : null;
    },
    answersOf: (attemptIds: readonly string[]): AnswerRow[] =>
      db
        .all<Raw>(
          `SELECT * FROM answers WHERE attempt_id IN (SELECT value FROM json_each(?))
           ORDER BY answered_at, rowid`,
          [JSON.stringify(attemptIds)],
        )
        .map(toAnswer),
    /** Gives a pending answer its score; the trigger refuses any other change. */
    grade: (id: string, score: number, gradedBy: 'self' | 'ai', at: string, feedback = '') =>
      db.run(
        `UPDATE answers SET score = ?, graded_by = ?, graded_at = ?, feedback = ?
         WHERE id = ? AND score IS NULL`,
        [score, gradedBy, at, feedback, id],
      ),

    // --- Study sessions ---------------------------------------------------------------------
    insertSession(row: {
      id: string;
      kind: 'practice' | 'quiz';
      moduleId: string | null;
      startedAt: string;
    }): void {
      db.run('INSERT INTO study_sessions (id, kind, module_id, started_at) VALUES (?, ?, ?, ?)', [
        row.id,
        row.kind,
        row.moduleId,
        row.startedAt,
      ]);
    },
    endSession: (id: string, at: string, stats: unknown) =>
      db.run(
        'UPDATE study_sessions SET ended_at = ?, stats_json = ? WHERE id = ? AND ended_at IS NULL',
        [at, JSON.stringify(stats), id],
      ),
  };
}
