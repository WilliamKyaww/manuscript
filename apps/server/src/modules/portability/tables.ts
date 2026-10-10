import type { SqlDatabase } from '../../db/sqlite';

/**
 * The tables an export carries (data-model.md §6): everything that is the student's own and cannot be
 * rebuilt from the files. The note index, the text and chunks read from sources, the graph's clusters,
 * the mastery cache, embeddings, search indexes and background jobs are derived and are left out — a
 * restored vault makes them again. Order here is the order in the archive, parents before children.
 */

export interface TableInfo {
  name: string;
  /** What it holds, for the schema document. */
  about: string;
}

export const CANONICAL_TABLES: readonly TableInfo[] = [
  {
    name: 'settings',
    about:
      'Vault settings: notes, review, study plan and lecture pipeline preferences (JSON values).',
  },
  { name: 'courses', about: 'Degree programmes, with the target average.' },
  {
    name: 'modules',
    about: 'Modules: code, title, credits, semester, target mark, archived or not.',
  },
  { name: 'lectures', about: 'Lectures, labs and tutorials of a module.' },
  { name: 'topics', about: 'A tree of topics inside a module.' },
  {
    name: 'assessments',
    about: 'Exams and coursework: weight, due date, length, hours left, mark.',
  },
  {
    name: 'sources',
    about: 'Imported slides, PDFs, documents and recordings (the originals are in vault/Sources).',
  },
  { name: 'lecture_sources', about: 'Which sources are attached to which lecture.' },
  { name: 'concepts', about: 'Concepts: name, summary, importance, backing note.' },
  { name: 'concept_aliases', about: 'Other names for a concept.' },
  { name: 'concept_modules', about: 'The modules a concept belongs to.' },
  { name: 'concept_topics', about: 'The topics a concept belongs to.' },
  {
    name: 'code_graphs',
    about:
      'Imported Graphify graphs of coursework repositories (the original graph.json is not kept: these rows are the import).',
  },
  { name: 'code_entities', about: 'The code in each imported graph: files, classes, functions.' },
  { name: 'code_edges', about: 'What uses what in each imported graph, as Graphify recorded it.' },
  {
    name: 'code_links',
    about: 'Which code implements which concept: suggested from names, then accepted or rejected.',
  },
  {
    name: 'relations',
    about:
      'Typed relations between concepts, notes, sources, lectures and modules, with provenance.',
  },
  { name: 'card_sets', about: 'Sets of flashcards.' },
  { name: 'cards', about: 'Flashcards: front, back, kind, status, where they came from.' },
  { name: 'card_concepts', about: 'Which concepts a card is about.' },
  {
    name: 'card_schedules',
    about: 'The spaced-repetition (FSRS) schedule of each face of each card.',
  },
  { name: 'study_sessions', about: 'Review, practice and tutor sessions.' },
  { name: 'review_logs', about: 'Every flashcard rating ever given (append-only).' },
  { name: 'questions', about: 'The question bank: stem, answer key, explanation, difficulty.' },
  { name: 'question_concepts', about: 'Which concepts a question tests.' },
  { name: 'quizzes', about: 'Practice quizzes, mock exams and tutor quizzes.' },
  { name: 'quiz_items', about: 'The questions of each quiz, in order.' },
  { name: 'quiz_attempts', about: 'Attempts at quizzes.' },
  {
    name: 'answers',
    about: 'Every answer ever given, with its score (append-only evidence for mastery).',
  },
  { name: 'proposals', about: 'The Inbox: suggestions the AI made and what was decided.' },
  {
    name: 'agent_actions',
    about: 'What the assistant or an MCP client did, with undo records (append-only).',
  },
  { name: 'chat_threads', about: 'Chat conversations with their settings and summaries.' },
  { name: 'chat_messages', about: 'The messages of each conversation.' },
  {
    name: 'tutor_sessions',
    about: 'The quiz and attempt each tutored conversation records answers in.',
  },
  { name: 'study_plans', about: 'Study plans.' },
  { name: 'plan_items', about: 'What is planned on each day, why, and whether it was done.' },
  { name: 'pipeline_runs', about: 'Runs of the lecture pipeline and what each step made.' },
  { name: 'ai_usage', about: 'What AI requests were made and what they cost.' },
];

/** What the archive deliberately leaves out, and how it comes back. */
export const DERIVED_TABLES = [
  [
    'notes, note_aliases, note_tags, note_links, attachments, notes_fts',
    'read again from the Markdown files',
  ],
  ['source_sections, chunks, chunks_fts', 'read again from the original files in Sources'],
  ['graph_communities, mastery_cache', 'worked out again from relations, reviews and answers'],
  ['embeddings', 'made again when semantic search is switched on'],
  ['jobs, recent_items', 'transient'],
] as const;

type Raw = Record<string, unknown>;

/** A value as JSON: bytes become `{"$base64": …}` so nothing is lost. */
export function toJson(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $base64: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return Number(value);
  return value;
}

export function fromJson(value: unknown): unknown {
  if (value && typeof value === 'object' && '$base64' in value)
    return new Uint8Array(Buffer.from(String((value as { $base64: string }).$base64), 'base64'));
  return value;
}

interface Column {
  name: string;
  pk: number;
}

export function columnsOf(db: SqlDatabase, table: string): Column[] {
  return db
    .all<Raw>(`PRAGMA table_info("${table}")`)
    .map((raw) => ({ name: String(raw.name), pk: Number(raw.pk) }));
}

/** Every row of a table, in primary key order, as plain objects. */
export function readTable(db: SqlDatabase, table: string): Record<string, unknown>[] {
  const columns = columnsOf(db, table);
  const keys = columns
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => `"${column.name}"`);
  const order = keys.length > 0 ? keys.join(', ') : 'rowid';
  return db.all<Raw>(`SELECT * FROM "${table}" ORDER BY ${order}`).map((raw) => {
    const row: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(raw)) row[name] = toJson(value);
    return row;
  });
}

/** Writes rows into an empty table; unknown columns (from a newer app) are refused. */
export function writeTable(
  db: SqlDatabase,
  table: string,
  rows: readonly Record<string, unknown>[],
): number {
  if (rows.length === 0) return 0;
  const known = new Set(columnsOf(db, table).map((column) => column.name));
  let written = 0;
  for (const row of rows) {
    const names = Object.keys(row);
    const unknown = names.filter((name) => !known.has(name));
    if (unknown.length > 0)
      throw new Error(
        `“${table}” has no column ${unknown.join(', ')}: the export is from a newer version.`,
      );
    db.run(
      `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      names.map((name) => fromJson(row[name]) as never),
    );
    written += 1;
  }
  return written;
}

/** Reads the CREATE statement of a table, comments included, for the schema document. */
export function createStatement(db: SqlDatabase, table: string): string {
  const row = db.get<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );
  return row?.sql ?? '';
}
