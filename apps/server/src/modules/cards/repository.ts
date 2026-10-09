import type { CardKind, CardStatus, ReviewState, Schedule } from '@skb/core';
import { ScheduleSchema } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for card sets, cards, their faces, review logs and study sessions (migration 0008). */

export interface SetRow {
  id: string;
  title: string;
  description: string;
  moduleId: string | null;
  lectureId: string | null;
  origin: 'manual' | 'ai' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface CardRow {
  id: string;
  setId: string;
  kind: CardKind;
  front: string;
  back: string;
  extra: string;
  status: CardStatus;
  locatorJson: string | null;
  createdBy: 'user' | 'ai' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface FaceRow {
  cardId: string;
  ordinal: number;
  state: ReviewState;
  due: string;
  schedule: Schedule;
  buriedUntil: string | null;
  retired: boolean;
}

export interface LogRow {
  id: string;
  kind: 'review' | 'undo';
  cardId: string;
  ordinal: number;
  rating: number | null;
  undoes: string | null;
  previous: Schedule;
  next: Schedule;
  reviewedAt: string;
  durationMs: number | null;
  sessionId: string | null;
}

type Raw = Record<string, unknown>;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

const toSet = (raw: Raw): SetRow => ({
  id: String(raw.id),
  title: String(raw.title),
  description: String(raw.description),
  moduleId: text(raw.module_id),
  lectureId: text(raw.lecture_id),
  origin: raw.origin as SetRow['origin'],
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

const toCard = (raw: Raw): CardRow => ({
  id: String(raw.id),
  setId: String(raw.set_id),
  kind: raw.kind as CardKind,
  front: String(raw.front),
  back: String(raw.back),
  extra: String(raw.extra),
  status: raw.status as CardStatus,
  locatorJson: text(raw.locator_json),
  createdBy: raw.created_by as CardRow['createdBy'],
  createdAt: String(raw.created_at),
  updatedAt: String(raw.updated_at),
});

const toFace = (raw: Raw): FaceRow => ({
  cardId: String(raw.card_id),
  ordinal: Number(raw.ordinal),
  state: raw.state as ReviewState,
  due: String(raw.due),
  schedule: ScheduleSchema.parse(JSON.parse(String(raw.schedule_json))),
  buriedUntil: text(raw.buried_until),
  retired: Number(raw.retired) === 1,
});

const toLog = (raw: Raw): LogRow => ({
  id: String(raw.id),
  kind: raw.kind as LogRow['kind'],
  cardId: String(raw.card_id),
  ordinal: Number(raw.ordinal),
  rating: raw.rating === null ? null : Number(raw.rating),
  undoes: text(raw.undoes),
  previous: ScheduleSchema.parse(JSON.parse(String(raw.previous_json))),
  next: ScheduleSchema.parse(JSON.parse(String(raw.next_json))),
  reviewedAt: String(raw.reviewed_at),
  durationMs: raw.duration_ms === null ? null : Number(raw.duration_ms),
  sessionId: text(raw.session_id),
});

/** A review that has not been taken back by an undo row. */
const STANDING = `l.kind = 'review' AND NOT EXISTS (SELECT 1 FROM review_logs u WHERE u.undoes = l.id)`;

export type CardsRepository = ReturnType<typeof createCardsRepository>;

export function createCardsRepository(db: SqlDatabase) {
  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),

    // --- Sets -------------------------------------------------------------------------------
    sets: (): SetRow[] =>
      db
        .all<Raw>(
          'SELECT * FROM card_sets WHERE deleted_at IS NULL ORDER BY title COLLATE NOCASE, id',
        )
        .map(toSet),
    set(id: string): SetRow | null {
      const raw = db.get<Raw>('SELECT * FROM card_sets WHERE id = ? AND deleted_at IS NULL', [id]);
      return raw ? toSet(raw) : null;
    },
    insertSet(row: SetRow): void {
      db.run(
        `INSERT INTO card_sets (id, title, description, module_id, lecture_id, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.description,
          row.moduleId,
          row.lectureId,
          row.origin,
          row.createdAt,
          row.updatedAt,
        ],
      );
    },
    updateSet(row: SetRow): void {
      db.run(
        `UPDATE card_sets SET title = ?, description = ?, module_id = ?, lecture_id = ?, updated_at = ?
         WHERE id = ?`,
        [row.title, row.description, row.moduleId, row.lectureId, row.updatedAt, row.id],
      );
    },
    deleteSet(id: string, at: string): void {
      db.run('UPDATE card_sets SET deleted_at = ?, updated_at = ? WHERE id = ?', [at, at, id]);
      db.run(`UPDATE cards SET status = 'deleted', updated_at = ? WHERE set_id = ?`, [at, id]);
    },
    /** Counts per set: cards, never-reviewed faces, faces due by `dueBy`, suspended cards. */
    setCounts(
      dueBy: string,
      now: string,
    ): Map<string, { cards: number; new: number; due: number; suspended: number }> {
      const counts = new Map<
        string,
        { cards: number; new: number; due: number; suspended: number }
      >();
      for (const raw of db.all<Raw>(
        `SELECT c.set_id,
           count(DISTINCT CASE WHEN c.status <> 'deleted' THEN c.id END) AS cards,
           count(DISTINCT CASE WHEN c.status = 'suspended' THEN c.id END) AS suspended,
           sum(CASE WHEN c.status = 'active' AND s.retired = 0 AND s.state = 'new' THEN 1 ELSE 0 END) AS new,
           sum(CASE WHEN c.status = 'active' AND s.retired = 0 AND s.state <> 'new'
                     AND (s.buried_until IS NULL OR s.buried_until <= ?)
                     AND s.due < (CASE WHEN s.state = 'review' THEN ? ELSE ? END) THEN 1 ELSE 0 END) AS due
         FROM cards c LEFT JOIN card_schedules s ON s.card_id = c.id
         GROUP BY c.set_id`,
        [now, dueBy, now],
      ))
        counts.set(String(raw.set_id), {
          cards: Number(raw.cards),
          new: Number(raw.new ?? 0),
          due: Number(raw.due ?? 0),
          suspended: Number(raw.suspended),
        });
      return counts;
    },

    // --- Cards ------------------------------------------------------------------------------
    cardsOfSet: (setId: string): CardRow[] =>
      db
        .all<Raw>(
          `SELECT * FROM cards WHERE set_id = ? AND status <> 'deleted' ORDER BY created_at, id`,
          [setId],
        )
        .map(toCard),
    card(id: string): CardRow | null {
      const raw = db.get<Raw>(`SELECT * FROM cards WHERE id = ? AND status <> 'deleted'`, [id]);
      return raw ? toCard(raw) : null;
    },
    /** Cards awaiting review (generated drafts), oldest first. */
    drafts: (): CardRow[] =>
      db.all<Raw>(`SELECT * FROM cards WHERE status = 'draft' ORDER BY created_at, id`).map(toCard),
    /** The text of every card in use, for duplicate checks. */
    texts: (): { id: string; text: string }[] =>
      db
        .all<Raw>(`SELECT id, front, back FROM cards WHERE status IN ('active', 'suspended')`)
        .map((raw) => ({ id: String(raw.id), text: `${String(raw.front)} ${String(raw.back)}` })),
    cardsByIds: (ids: readonly string[]): CardRow[] =>
      db
        .all<Raw>(
          `SELECT * FROM cards WHERE id IN (SELECT value FROM json_each(?)) AND status <> 'deleted'`,
          [JSON.stringify(ids)],
        )
        .map(toCard),
    insertCard(row: CardRow): void {
      db.run(
        `INSERT INTO cards (id, set_id, kind, front, back, extra, status, locator_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.setId,
          row.kind,
          row.front,
          row.back,
          row.extra,
          row.status,
          row.locatorJson,
          row.createdBy,
          row.createdAt,
          row.updatedAt,
        ],
      );
    },
    updateCard(row: CardRow): void {
      db.run(
        `UPDATE cards SET set_id = ?, kind = ?, front = ?, back = ?, extra = ?, status = ?, locator_json = ?,
           updated_at = ? WHERE id = ?`,
        [
          row.setId,
          row.kind,
          row.front,
          row.back,
          row.extra,
          row.status,
          row.locatorJson,
          row.updatedAt,
          row.id,
        ],
      );
    },
    setStatus(ids: readonly string[], status: CardStatus, at: string): number {
      return Number(
        db.run(
          `UPDATE cards SET status = ?, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND status <> 'deleted'`,
          [status, at, JSON.stringify(ids)],
        ).changes,
      );
    },
    moveCards(ids: readonly string[], setId: string, at: string): number {
      return Number(
        db.run(
          `UPDATE cards SET set_id = ?, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND status <> 'deleted'`,
          [setId, at, JSON.stringify(ids)],
        ).changes,
      );
    },
    conceptsOf(cardIds: readonly string[]): Map<string, { id: string; name: string }[]> {
      const map = new Map<string, { id: string; name: string }[]>();
      for (const raw of db.all<Raw>(
        `SELECT cc.card_id, c.id, c.name FROM card_concepts cc JOIN concepts c ON c.id = cc.concept_id
         WHERE cc.card_id IN (SELECT value FROM json_each(?)) ORDER BY c.name_key`,
        [JSON.stringify(cardIds)],
      )) {
        const list = map.get(String(raw.card_id)) ?? [];
        list.push({ id: String(raw.id), name: String(raw.name) });
        map.set(String(raw.card_id), list);
      }
      return map;
    },
    setConcepts(cardId: string, conceptIds: readonly string[]): void {
      db.run('DELETE FROM card_concepts WHERE card_id = ?', [cardId]);
      for (const conceptId of conceptIds)
        db.run('INSERT INTO card_concepts (card_id, concept_id) VALUES (?, ?)', [
          cardId,
          conceptId,
        ]);
    },
    existingConcepts: (ids: readonly string[]): Set<string> =>
      new Set(
        db
          .all<{ id: string }>(
            'SELECT id FROM concepts WHERE id IN (SELECT value FROM json_each(?))',
            [JSON.stringify(ids)],
          )
          .map((row) => row.id),
      ),

    // --- Faces ------------------------------------------------------------------------------
    faces(cardIds: readonly string[]): FaceRow[] {
      return db
        .all<Raw>(
          `SELECT * FROM card_schedules WHERE card_id IN (SELECT value FROM json_each(?)) ORDER BY card_id, ordinal`,
          [JSON.stringify(cardIds)],
        )
        .map(toFace);
    },
    face(cardId: string, ordinal: number): FaceRow | null {
      const raw = db.get<Raw>('SELECT * FROM card_schedules WHERE card_id = ? AND ordinal = ?', [
        cardId,
        ordinal,
      ]);
      return raw ? toFace(raw) : null;
    },
    insertFace(cardId: string, ordinal: number, schedule: Schedule): void {
      db.run(
        `INSERT INTO card_schedules (card_id, ordinal, state, due, schedule_json) VALUES (?, ?, ?, ?, ?)`,
        [cardId, ordinal, schedule.state, schedule.due, JSON.stringify(schedule)],
      );
    },
    saveSchedule(cardId: string, ordinal: number, schedule: Schedule): void {
      db.run(
        `UPDATE card_schedules SET state = ?, due = ?, schedule_json = ?, buried_until = NULL
         WHERE card_id = ? AND ordinal = ?`,
        [schedule.state, schedule.due, JSON.stringify(schedule), cardId, ordinal],
      );
    },
    setRetired(cardId: string, ordinal: number, retired: boolean): void {
      db.run('UPDATE card_schedules SET retired = ? WHERE card_id = ? AND ordinal = ?', [
        retired ? 1 : 0,
        cardId,
        ordinal,
      ]);
    },
    bury(cardId: string, ordinal: number, until: string): void {
      db.run('UPDATE card_schedules SET buried_until = ? WHERE card_id = ? AND ordinal = ?', [
        until,
        cardId,
        ordinal,
      ]);
    },
    /**
     * Faces that could be reviewed now: of active cards in live sets, not retired, not buried; with
     * a set or module to narrow to. New faces in creation order; others soonest first.
     */
    reviewable(filter: { setId?: string; moduleId?: string }, now: string, dueBy: string) {
      return db
        .all<Raw>(
          `SELECT s.*, c.set_id, c.created_at AS card_created FROM card_schedules s
           JOIN cards c ON c.id = s.card_id
           JOIN card_sets cs ON cs.id = c.set_id AND cs.deleted_at IS NULL
           WHERE c.status = 'active' AND s.retired = 0
             AND (s.buried_until IS NULL OR s.buried_until <= ?)
             AND (s.state = 'new' OR s.due < ?)
             AND (? IS NULL OR c.set_id = ?) AND (? IS NULL OR cs.module_id = ?)
           ORDER BY s.state = 'new', c.created_at, s.card_id, s.ordinal`,
          [
            now,
            dueBy,
            filter.setId ?? null,
            filter.setId ?? null,
            filter.moduleId ?? null,
            filter.moduleId ?? null,
          ],
        )
        .map((raw) => ({ ...toFace(raw), setId: String(raw.set_id) }));
    },
    /** The soonest learning face due later than `now`, for "come back in …". */
    nextLearningDue(filter: { setId?: string; moduleId?: string }, now: string): string | null {
      const raw = db.get<Raw>(
        `SELECT min(s.due) AS due FROM card_schedules s
         JOIN cards c ON c.id = s.card_id
         JOIN card_sets cs ON cs.id = c.set_id AND cs.deleted_at IS NULL
         WHERE c.status = 'active' AND s.retired = 0 AND s.state IN ('learning', 'relearning') AND s.due >= ?
           AND (? IS NULL OR c.set_id = ?) AND (? IS NULL OR cs.module_id = ?)`,
        [
          now,
          filter.setId ?? null,
          filter.setId ?? null,
          filter.moduleId ?? null,
          filter.moduleId ?? null,
        ],
      );
      return text(raw?.due);
    },

    // --- Logs and sessions --------------------------------------------------------------------
    insertLog(row: LogRow & { elapsedDays: number | null }): void {
      db.run(
        `INSERT INTO review_logs (id, kind, card_id, ordinal, rating, undoes, previous_json, next_json, elapsed_days,
           reviewed_at, duration_ms, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.kind,
          row.cardId,
          row.ordinal,
          row.rating,
          row.undoes,
          JSON.stringify(row.previous),
          JSON.stringify(row.next),
          row.elapsedDays,
          row.reviewedAt,
          row.durationMs,
          row.sessionId,
        ],
      );
    },
    /** The latest standing review, in a session or anywhere. */
    lastReview(sessionId: string | null): LogRow | null {
      const raw = db.get<Raw>(
        `SELECT l.* FROM review_logs l WHERE ${STANDING} AND (? IS NULL OR l.session_id = ?)
         ORDER BY l.reviewed_at DESC, l.id DESC LIMIT 1`,
        [sessionId, sessionId],
      );
      return raw ? toLog(raw) : null;
    },
    /** Standing reviews between two times (inclusive start), oldest first. */
    reviewsBetween(from: string, to: string): LogRow[] {
      return db
        .all<Raw>(
          `SELECT l.* FROM review_logs l WHERE ${STANDING} AND l.reviewed_at >= ? AND l.reviewed_at < ?
           ORDER BY l.reviewed_at, l.id`,
          [from, to],
        )
        .map(toLog);
    },
    reviewsOfSession(sessionId: string): LogRow[] {
      return db
        .all<Raw>(
          `SELECT l.* FROM review_logs l WHERE ${STANDING} AND l.session_id = ? ORDER BY l.reviewed_at`,
          [sessionId],
        )
        .map(toLog);
    },
    insertSession(row: {
      id: string;
      setId: string | null;
      moduleId: string | null;
      startedAt: string;
    }): void {
      db.run(
        `INSERT INTO study_sessions (id, kind, set_id, module_id, started_at) VALUES (?, 'review', ?, ?, ?)`,
        [row.id, row.setId, row.moduleId, row.startedAt],
      );
    },
    session(id: string): { id: string; startedAt: string; endedAt: string | null } | null {
      const raw = db.get<Raw>(`SELECT * FROM study_sessions WHERE id = ? AND kind = 'review'`, [
        id,
      ]);
      return raw
        ? { id: String(raw.id), startedAt: String(raw.started_at), endedAt: text(raw.ended_at) }
        : null;
    },
    endSession(id: string, at: string, stats: unknown): void {
      db.run('UPDATE study_sessions SET ended_at = ?, stats_json = ? WHERE id = ?', [
        at,
        JSON.stringify(stats),
        id,
      ]);
    },
    /** Due dates of all live faces, for the forecast. */
    liveDueDates(): { state: ReviewState; due: string }[] {
      return db
        .all<Raw>(
          `SELECT s.state, s.due FROM card_schedules s JOIN cards c ON c.id = s.card_id
           JOIN card_sets cs ON cs.id = c.set_id AND cs.deleted_at IS NULL
           WHERE c.status = 'active' AND s.retired = 0 AND s.state <> 'new'`,
        )
        .map((raw) => ({ state: raw.state as ReviewState, due: String(raw.due) }));
    },
    totals(): { cards: number; faces: number } {
      const raw = db.get<Raw>(
        `SELECT (SELECT count(*) FROM cards c JOIN card_sets cs ON cs.id = c.set_id AND cs.deleted_at IS NULL
                   WHERE c.status <> 'deleted') AS cards,
                (SELECT count(*) FROM card_schedules s JOIN cards c ON c.id = s.card_id
                   JOIN card_sets cs ON cs.id = c.set_id AND cs.deleted_at IS NULL
                   WHERE c.status <> 'deleted' AND s.retired = 0) AS faces`,
      );
      return { cards: Number(raw?.cards ?? 0), faces: Number(raw?.faces ?? 0) };
    },
  };
}
