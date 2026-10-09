-- 0009_questions_mastery — questions, quizzes, attempts, answers and the mastery cache (Phase 9,
-- learning-system.md §§4–7, ADR-0021). All CANONICAL (export required) except mastery_cache, which
-- is derived and rebuilt from cards and answers whenever it is out of date.

CREATE TABLE questions (
  id           TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'qst_*'),
  kind         TEXT    NOT NULL CHECK (kind IN ('mcq', 'multi', 'true_false', 'numeric', 'short',
                                                'explain', 'derivation', 'code')),
  stem         TEXT    NOT NULL,                    -- Markdown with maths
  answer_json  TEXT    NOT NULL,                    -- the key, options included (@skb/core QuestionAnswerSchema)
  rubric       TEXT    NOT NULL DEFAULT '',
  explanation  TEXT    NOT NULL DEFAULT '',
  hint         TEXT    NOT NULL DEFAULT '',
  difficulty   INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  -- Deleted softly: answers keep pointing at the question they answered.
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'suspended', 'deleted')),
  module_id    TEXT    REFERENCES modules (id) ON DELETE SET NULL,
  lecture_id   TEXT    REFERENCES lectures (id) ON DELETE SET NULL,
  tags_json    TEXT    NOT NULL DEFAULT '[]',
  locator_json TEXT,
  created_by   TEXT    NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai', 'import')),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
) STRICT;

CREATE INDEX questions_module ON questions (module_id, status);

CREATE TABLE question_concepts (
  question_id TEXT NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  concept_id  TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, concept_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX question_concepts_concept ON question_concepts (concept_id);

CREATE TABLE quizzes (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'quiz_*'),
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('practice', 'mock_exam', 'adaptive')),
  config_json   TEXT NOT NULL,                      -- scope, count, kinds, difficulty, time limit
  module_id     TEXT REFERENCES modules (id) ON DELETE SET NULL,
  assessment_id TEXT REFERENCES assessments (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  deleted_at    TEXT                                -- deleted softly; attempts stay as evidence
) STRICT;

-- The questions a practice quiz or mock exam was built with; a Learn session chooses as it goes.
CREATE TABLE quiz_items (
  quiz_id     TEXT    NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  question_id TEXT    NOT NULL REFERENCES questions (id),
  PRIMARY KEY (quiz_id, ordinal)
) STRICT, WITHOUT ROWID;

CREATE TABLE quiz_attempts (
  id          TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'att_*'),
  quiz_id     TEXT NOT NULL REFERENCES quizzes (id),
  started_at  TEXT NOT NULL,
  deadline    TEXT,                                 -- started_at plus the time limit
  finished_at TEXT,
  score       REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  draft_json  TEXT,                                 -- a mock exam's unsubmitted responses (not evidence)
  session_id  TEXT REFERENCES study_sessions (id)
) STRICT;

CREATE INDEX quiz_attempts_quiz ON quiz_attempts (quiz_id, started_at);

-- Append-only evidence. The one change allowed: a pending answer (score NULL, waiting for the
-- student to grade it against the model answer) is given its score, once.
CREATE TABLE answers (
  id            TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'ans_*'),
  attempt_id    TEXT    NOT NULL REFERENCES quiz_attempts (id),
  question_id   TEXT    NOT NULL REFERENCES questions (id),
  concept_id    TEXT,                               -- a Learn session's concept; no key, concepts can go
  response_json TEXT,                               -- NULL: a mock-exam question left blank
  score         REAL    CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  graded_by     TEXT    CHECK (graded_by IS NULL OR graded_by IN ('auto', 'self', 'ai')),
  graded_at     TEXT,
  feedback      TEXT    NOT NULL DEFAULT '',
  confidence    INTEGER CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 3),
  assisted      INTEGER NOT NULL DEFAULT 0 CHECK (assisted IN (0, 1)),
  duration_ms   INTEGER,
  answered_at   TEXT    NOT NULL,
  CHECK ((score IS NULL) = (graded_by IS NULL))
) STRICT;

CREATE INDEX answers_attempt ON answers (attempt_id, answered_at);
CREATE INDEX answers_question ON answers (question_id, answered_at);

CREATE TRIGGER answers_no_delete BEFORE DELETE ON answers BEGIN
  SELECT RAISE(ABORT, 'answers are append-only');
END;
CREATE TRIGGER answers_grade_once BEFORE UPDATE ON answers
WHEN OLD.score IS NOT NULL OR NEW.score IS NULL
  OR NEW.id IS NOT OLD.id OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.question_id IS NOT OLD.question_id OR NEW.concept_id IS NOT OLD.concept_id
  OR NEW.response_json IS NOT OLD.response_json OR NEW.confidence IS NOT OLD.confidence
  OR NEW.assisted IS NOT OLD.assisted OR NEW.duration_ms IS NOT OLD.duration_ms
  OR NEW.answered_at IS NOT OLD.answered_at
BEGIN
  SELECT RAISE(ABORT, 'answers are append-only; a pending answer can be graded once');
END;

-- Derived: the last computed mastery of each concept, topic, module and the whole course, with
-- the components it came from. Rebuilt from cards and answers; never edited directly.
CREATE TABLE mastery_cache (
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('concept', 'topic', 'module', 'course')),
  entity_id       TEXT NOT NULL,
  score           REAL,
  stage           TEXT,
  confidence      TEXT,
  components_json TEXT NOT NULL,
  computed_at     TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
) STRICT, WITHOUT ROWID;
