-- 0008_flashcards — card sets, cards, their faces' schedules, review logs and study sessions
-- (Phase 8, learning-system.md §3, ADR-0011, ADR-0031). All CANONICAL (export required).
-- A card is what the student writes; a face is what is reviewed: one for a basic card, two for a
-- reversed one, one per cloze number. Each face has its own FSRS schedule.

CREATE TABLE card_sets (
  id          TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'set_*'),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  module_id   TEXT REFERENCES modules (id) ON DELETE SET NULL,
  lecture_id  TEXT REFERENCES lectures (id) ON DELETE SET NULL,
  origin      TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'ai', 'import')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT                                    -- sets are deleted softly, with their cards
) STRICT;

CREATE TABLE cards (
  id           TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'card_*'),
  set_id       TEXT NOT NULL REFERENCES card_sets (id),
  kind         TEXT NOT NULL CHECK (kind IN ('basic', 'reversed', 'cloze')),
  front        TEXT NOT NULL,                         -- Markdown; for cloze cards, the text with {{cN::…}}
  back         TEXT NOT NULL DEFAULT '',
  extra        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'suspended', 'deleted')),
  locator_json TEXT,
  created_by   TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai', 'import')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;

CREATE INDEX cards_set ON cards (set_id, status);

CREATE TABLE card_concepts (
  card_id    TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, concept_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX card_concepts_concept ON card_concepts (concept_id);

-- One row per face. A face whose cloze number disappears from its card is kept (its history stays)
-- but marked retired; it comes back if the number does.
CREATE TABLE card_schedules (
  card_id       TEXT    NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  ordinal       INTEGER NOT NULL CHECK (ordinal >= 0),
  state         TEXT    NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  due           TEXT    NOT NULL,                     -- ISO time; for new faces, when they were created
  schedule_json TEXT    NOT NULL,                     -- the full FSRS state (@skb/core ScheduleSchema)
  buried_until  TEXT,
  retired       INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
  PRIMARY KEY (card_id, ordinal)
) STRICT, WITHOUT ROWID;

CREATE INDEX card_schedules_due ON card_schedules (state, due) WHERE retired = 0;

CREATE TABLE study_sessions (
  id         TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'ses_*'),
  kind       TEXT NOT NULL CHECK (kind IN ('review', 'practice', 'quiz', 'tutor', 'reading')),
  set_id     TEXT REFERENCES card_sets (id) ON DELETE SET NULL,
  module_id  TEXT REFERENCES modules (id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  stats_json TEXT
) STRICT;

-- Append-only: every rating is a row, and so is undoing one (kind 'undo', pointing at the rating it
-- takes back), so the history needed to optimise FSRS later is never lost (ADR-0011).
CREATE TABLE review_logs (
  id            TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'rev_*'),
  kind          TEXT    NOT NULL CHECK (kind IN ('review', 'undo')),
  card_id       TEXT    NOT NULL REFERENCES cards (id),
  ordinal       INTEGER NOT NULL,
  rating        INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 4),
  undoes        TEXT    REFERENCES review_logs (id),
  previous_json TEXT    NOT NULL,                     -- the face's schedule before
  next_json     TEXT    NOT NULL,                     -- and after
  elapsed_days  REAL,                                 -- days since the face's previous review
  reviewed_at   TEXT    NOT NULL,
  duration_ms   INTEGER,
  session_id    TEXT    REFERENCES study_sessions (id),
  CHECK ((kind = 'review' AND rating IS NOT NULL AND undoes IS NULL)
      OR (kind = 'undo' AND rating IS NULL AND undoes IS NOT NULL))
) STRICT;

CREATE INDEX review_logs_card ON review_logs (card_id, ordinal, reviewed_at);
CREATE INDEX review_logs_time ON review_logs (reviewed_at);
CREATE INDEX review_logs_session ON review_logs (session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX review_logs_undone ON review_logs (undoes) WHERE undoes IS NOT NULL;

CREATE TRIGGER review_logs_no_update BEFORE UPDATE ON review_logs BEGIN
  SELECT RAISE(ABORT, 'review logs are append-only');
END;
CREATE TRIGGER review_logs_no_delete BEFORE DELETE ON review_logs BEGIN
  SELECT RAISE(ABORT, 'review logs are append-only');
END;
