import type { SqlDatabase, SqlValue } from '../../db/sqlite';

/**
 * SQL for the course structure (migration 0006). Notes and sources are joined to modules and
 * lectures through codes written in files — a note's `module`/`lecture` properties and a source's
 * `Sources/<code>/` folder — compared case-insensitively (ADR-0029).
 */

export interface CourseRow {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  targetAverage: number | null;
  notes: string;
}

export interface ModuleRow {
  id: string;
  courseId: string | null;
  code: string;
  codeKey: string;
  title: string;
  credits: number | null;
  semester: string | null;
  colour: string | null;
  targetMark: number | null;
  archived: boolean;
}

export interface LectureRow {
  id: string;
  moduleId: string;
  key: string;
  keyNorm: string;
  title: string;
  kind: 'lecture' | 'lab' | 'tutorial' | 'workshop' | 'seminar';
  week: number | null;
  heldOn: string | null;
  ordinal: number;
}

export interface TopicRow {
  id: string;
  moduleId: string;
  parentId: string | null;
  title: string;
  ordinal: number;
}

export interface AssessmentRow {
  id: string;
  moduleId: string;
  title: string;
  kind: 'exam' | 'coursework' | 'test' | 'presentation' | 'project';
  weight: number;
  dueAt: string | null;
  durationMinutes: number | null;
  remainingHours: number | null;
  status: 'planned' | 'submitted' | 'marked';
  markAchieved: number | null;
  notes: string;
}

export interface NoteRefRow {
  id: string;
  path: string;
  title: string;
}

export interface SourceRefRow {
  id: string;
  title: string;
  kind: string;
  path: string;
  status: string;
}

type Raw = Record<string, unknown>;
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

/** camelCase field → column, per table; the only columns a write may touch. */
const COLUMNS = {
  courses: {
    id: 'id',
    title: 'title',
    startDate: 'start_date',
    endDate: 'end_date',
    targetAverage: 'target_average',
    notes: 'notes',
  },
  modules: {
    id: 'id',
    courseId: 'course_id',
    code: 'code',
    codeKey: 'code_key',
    title: 'title',
    credits: 'credits',
    semester: 'semester',
    colour: 'colour',
    targetMark: 'target_mark',
    archived: 'archived',
  },
  lectures: {
    id: 'id',
    moduleId: 'module_id',
    key: 'key',
    keyNorm: 'key_norm',
    title: 'title',
    kind: 'kind',
    week: 'week',
    heldOn: 'held_on',
    ordinal: 'ordinal',
  },
  topics: {
    id: 'id',
    moduleId: 'module_id',
    parentId: 'parent_id',
    title: 'title',
    ordinal: 'ordinal',
  },
  assessments: {
    id: 'id',
    moduleId: 'module_id',
    title: 'title',
    kind: 'kind',
    weight: 'weight',
    dueAt: 'due_at',
    durationMinutes: 'duration_minutes',
    remainingHours: 'remaining_hours',
    status: 'status',
    markAchieved: 'mark_achieved',
    notes: 'notes',
  },
} as const;

type Table = keyof typeof COLUMNS;

const toCourse = (raw: Raw): CourseRow => ({
  id: String(raw.id),
  title: String(raw.title),
  startDate: str(raw.start_date),
  endDate: str(raw.end_date),
  targetAverage: num(raw.target_average),
  notes: String(raw.notes ?? ''),
});

const toModule = (raw: Raw): ModuleRow => ({
  id: String(raw.id),
  courseId: str(raw.course_id),
  code: String(raw.code),
  codeKey: String(raw.code_key),
  title: String(raw.title),
  credits: num(raw.credits),
  semester: str(raw.semester),
  colour: str(raw.colour),
  targetMark: num(raw.target_mark),
  archived: raw.archived === 1,
});

const toLecture = (raw: Raw): LectureRow => ({
  id: String(raw.id),
  moduleId: String(raw.module_id),
  key: String(raw.key),
  keyNorm: String(raw.key_norm),
  title: String(raw.title),
  kind: raw.kind as LectureRow['kind'],
  week: num(raw.week),
  heldOn: str(raw.held_on),
  ordinal: Number(raw.ordinal),
});

const toTopic = (raw: Raw): TopicRow => ({
  id: String(raw.id),
  moduleId: String(raw.module_id),
  parentId: str(raw.parent_id),
  title: String(raw.title),
  ordinal: Number(raw.ordinal),
});

const toAssessment = (raw: Raw): AssessmentRow => ({
  id: String(raw.id),
  moduleId: String(raw.module_id),
  title: String(raw.title),
  kind: raw.kind as AssessmentRow['kind'],
  weight: Number(raw.weight),
  dueAt: str(raw.due_at),
  durationMinutes: num(raw.duration_minutes),
  remainingHours: num(raw.remaining_hours),
  status: raw.status as AssessmentRow['status'],
  markAchieved: num(raw.mark_achieved),
  notes: String(raw.notes ?? ''),
});

const toNoteRef = (raw: Raw): NoteRefRow => ({
  id: String(raw.id),
  path: String(raw.path),
  title: String(raw.title),
});

/** Notes whose `lecture` property names the lecture: `CODE/KEY`, or `KEY` with `module: CODE`. */
const LECTURE_NOTES = `(lower(n.lecture_key) = ? || '/' || ?
  OR (lower(n.lecture_key) = ? AND lower(coalesce(n.module_code, '')) = ?))`;

export type LearningRepository = ReturnType<typeof createLearningRepository>;

export function createLearningRepository(db: SqlDatabase) {
  const toSql = (value: unknown): SqlValue =>
    typeof value === 'boolean' ? (value ? 1 : 0) : ((value ?? null) as SqlValue);

  const insert = (table: Table, values: Record<string, unknown>, now: string) => {
    const columns = COLUMNS[table] as Record<string, string>;
    const entries = Object.entries(values).filter(([key]) => key in columns);
    db.run(
      `INSERT INTO ${table} (${entries.map(([key]) => columns[key]).join(', ')}, created_at, updated_at)
       VALUES (${entries.map(() => '?').join(', ')}, ?, ?)`,
      [...entries.map(([, value]) => toSql(value)), now, now],
    );
  };

  const update = (table: Table, id: string, values: Record<string, unknown>, now: string) => {
    const columns = COLUMNS[table] as Record<string, string>;
    const entries = Object.entries(values).filter(([key]) => key in columns && key !== 'id');
    if (entries.length === 0) return;
    db.run(
      `UPDATE ${table} SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')}, updated_at = ?
       WHERE id = ?`,
      [...entries.map(([, value]) => toSql(value)), now, id],
    );
  };

  const remove = (table: Table, id: string) => db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  const one = <T>(sql: string, params: SqlValue[], map: (raw: Raw) => T): T | null => {
    const raw = db.get<Raw>(sql, params);
    return raw ? map(raw) : null;
  };
  const count = (sql: string, params: SqlValue[]) =>
    Number(db.get<{ n: number }>(sql, params)?.n ?? 0);

  return {
    transaction: <T>(fn: () => T): T => db.transaction(fn),
    insert,
    update,
    remove,

    courses: () =>
      db.all<Raw>('SELECT * FROM courses ORDER BY start_date DESC, title').map(toCourse),
    course: (id: string) => one('SELECT * FROM courses WHERE id = ?', [id], toCourse),

    modules: () => db.all<Raw>('SELECT * FROM modules ORDER BY archived, code_key').map(toModule),
    module: (id: string) => one('SELECT * FROM modules WHERE id = ?', [id], toModule),
    moduleByCode: (codeKey: string) =>
      one('SELECT * FROM modules WHERE code_key = ?', [codeKey], toModule),

    lectures: (moduleId: string) =>
      db
        .all<Raw>(
          'SELECT * FROM lectures WHERE module_id = ? ORDER BY ordinal, week, held_on, key_norm',
          [moduleId],
        )
        .map(toLecture),
    lecture: (id: string) => one('SELECT * FROM lectures WHERE id = ?', [id], toLecture),
    lectureByKey: (moduleId: string, keyNorm: string) =>
      one(
        'SELECT * FROM lectures WHERE module_id = ? AND key_norm = ?',
        [moduleId, keyNorm],
        toLecture,
      ),

    topics: (moduleId: string) =>
      db
        .all<Raw>('SELECT * FROM topics WHERE module_id = ? ORDER BY ordinal, title', [moduleId])
        .map(toTopic),
    topic: (id: string) => one('SELECT * FROM topics WHERE id = ?', [id], toTopic),

    assessments: (moduleId: string) =>
      db
        .all<Raw>(
          `SELECT * FROM assessments WHERE module_id = ?
           ORDER BY due_at IS NULL, due_at, title`,
          [moduleId],
        )
        .map(toAssessment),
    assessment: (id: string) => one('SELECT * FROM assessments WHERE id = ?', [id], toAssessment),
    /** Assessments still to do (not submitted or marked) due between two dates (inclusive), soonest first. */
    dueBetween: (from: string, to: string) =>
      db
        .all<Raw>(
          `SELECT a.* FROM assessments a JOIN modules m ON m.id = a.module_id
           WHERE m.archived = 0 AND a.status = 'planned' AND a.due_at IS NOT NULL
             AND substr(a.due_at, 1, 10) BETWEEN ? AND ?
           ORDER BY a.due_at, a.title`,
          [from, to],
        )
        .map(toAssessment),

    // --- Files joined by code ----------------------------------------------------------------

    sourcesOfModule: (codeKey: string): SourceRefRow[] =>
      db
        .all<Raw>(
          `SELECT id, title, kind, path, status FROM sources
           WHERE deleted_at IS NULL AND lower(module_code) = ? ORDER BY title`,
          [codeKey],
        )
        .map((raw) => ({
          id: String(raw.id),
          title: String(raw.title),
          kind: String(raw.kind),
          path: String(raw.path),
          status: String(raw.status),
        })),
    notesOfModule: (codeKey: string) =>
      db
        .all<Raw>(
          `SELECT n.id, n.path, n.title FROM notes n WHERE lower(n.module_code) = ? ORDER BY n.title`,
          [codeKey],
        )
        .map(toNoteRef),
    notesOfLecture: (codeKey: string, keyNorm: string) =>
      db
        .all<Raw>(
          `SELECT n.id, n.path, n.title FROM notes n WHERE ${LECTURE_NOTES} ORDER BY n.title`,
          [codeKey, keyNorm, keyNorm, codeKey],
        )
        .map(toNoteRef),
    countNotesOfLecture: (codeKey: string, keyNorm: string) =>
      count(`SELECT count(*) AS n FROM notes n WHERE ${LECTURE_NOTES}`, [
        codeKey,
        keyNorm,
        keyNorm,
        codeKey,
      ]),
    countSourcesOfModule: (codeKey: string) =>
      count(
        'SELECT count(*) AS n FROM sources WHERE deleted_at IS NULL AND lower(module_code) = ?',
        [codeKey],
      ),
    countNotesOfModule: (codeKey: string) =>
      count('SELECT count(*) AS n FROM notes WHERE lower(module_code) = ?', [codeKey]),

    // --- Lecture sources ---------------------------------------------------------------------

    sourcesOfLecture: (lectureId: string): SourceRefRow[] =>
      db
        .all<Raw>(
          `SELECT s.id, s.title, s.kind, s.path, s.status FROM lecture_sources ls
           JOIN sources s ON s.id = ls.source_id
           WHERE ls.lecture_id = ? AND s.deleted_at IS NULL ORDER BY s.title`,
          [lectureId],
        )
        .map((raw) => ({
          id: String(raw.id),
          title: String(raw.title),
          kind: String(raw.kind),
          path: String(raw.path),
          status: String(raw.status),
        })),
    countSourcesOfLecture: (lectureId: string) =>
      count(
        `SELECT count(*) AS n FROM lecture_sources ls JOIN sources s ON s.id = ls.source_id
         WHERE ls.lecture_id = ? AND s.deleted_at IS NULL`,
        [lectureId],
      ),
    attachSource: (lectureId: string, sourceId: string, now: string) =>
      db.run(
        `INSERT INTO lecture_sources (lecture_id, source_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [lectureId, sourceId, now],
      ),
    detachSource: (lectureId: string, sourceId: string) =>
      db.run('DELETE FROM lecture_sources WHERE lecture_id = ? AND source_id = ?', [
        lectureId,
        sourceId,
      ]),

    /** Concepts linked from the given notes (by note id). */
    conceptsLinkedFrom: (noteIds: readonly string[]) =>
      db
        .all<Raw>(
          `SELECT DISTINCT c.id, c.name FROM note_links l
           JOIN notes n ON n.doc_id = l.source_doc
           JOIN concepts c ON c.id = l.target_concept
           WHERE n.id IN (SELECT value FROM json_each(?)) ORDER BY c.name`,
          [JSON.stringify(noteIds)],
        )
        .map((raw) => ({ id: String(raw.id), name: String(raw.name) })),
    conceptsOfModule: (moduleId: string) =>
      db
        .all<Raw>(
          `SELECT c.id, c.name FROM concept_modules cm JOIN concepts c ON c.id = cm.concept_id
           WHERE cm.module_id = ? ORDER BY c.name`,
          [moduleId],
        )
        .map((raw) => ({ id: String(raw.id), name: String(raw.name) })),
  };
}
