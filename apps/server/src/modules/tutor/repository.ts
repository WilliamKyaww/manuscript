import type { SqlDatabase } from '../../db/sqlite';

/** SQL for tutor sessions (migration 0014): the quiz and attempt a tutored chat records answers in. */

export interface TutorSessionRow {
  threadId: string;
  quizId: string;
  attemptId: string;
  createdAt: string;
}

type Raw = Record<string, unknown>;

export type TutorRepository = ReturnType<typeof createTutorRepository>;

export function createTutorRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    session(threadId: string): TutorSessionRow | null {
      const raw = db.get<Raw>('SELECT * FROM tutor_sessions WHERE thread_id = ?', [threadId]);
      return raw
        ? {
            threadId: String(raw.thread_id),
            quizId: String(raw.quiz_id),
            attemptId: String(raw.attempt_id),
            createdAt: String(raw.created_at),
          }
        : null;
    },
    insertSession(row: TutorSessionRow): void {
      db.run(
        'INSERT INTO tutor_sessions (thread_id, quiz_id, attempt_id, created_at) VALUES (?, ?, ?, ?)',
        [row.threadId, row.quizId, row.attemptId, row.createdAt],
      );
    },
    setAttempt: (threadId: string, attemptId: string) =>
      db.run('UPDATE tutor_sessions SET attempt_id = ? WHERE thread_id = ?', [attemptId, threadId]),

    /** Does the thread exist (an answer is recorded only in a conversation)? */
    threadTitle(threadId: string): string | null {
      const raw = db.get<Raw>('SELECT title FROM chat_threads WHERE id = ?', [threadId]);
      return raw ? String(raw.title) : null;
    },

    /** Questions the thread has already put to the student, so they are not asked twice. */
    answeredIn(attemptIds: readonly string[]): Set<string> {
      if (attemptIds.length === 0) return new Set();
      const marks = attemptIds.map(() => '?').join(', ');
      return new Set(
        db
          .all<Raw>(`SELECT DISTINCT question_id FROM answers WHERE attempt_id IN (${marks})`, [
            ...attemptIds,
          ])
          .map((raw) => String(raw.question_id)),
      );
    },
    attemptsOf(quizId: string): string[] {
      return db
        .all<Raw>('SELECT id FROM quiz_attempts WHERE quiz_id = ? ORDER BY started_at', [quizId])
        .map((raw) => String(raw.id));
    },
  };
}
