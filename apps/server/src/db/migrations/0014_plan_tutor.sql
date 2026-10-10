-- 0014_plan_tutor — the study plan, hours left on coursework, tutor sessions and corrections
-- (Phase 14, learning-system.md §9, ADR-0037).
--
-- Plans are CANONICAL (export required): what the student did and skipped is kept when the plan is
-- made again. The rest of the plan is derived and can always be regenerated.

CREATE TABLE study_plans (
  id               TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'plan_*'),
  title            TEXT NOT NULL,
  start_date       TEXT NOT NULL,                      -- YYYY-MM-DD
  end_date         TEXT NOT NULL,
  params_json      TEXT NOT NULL CHECK (json_valid(params_json)),   -- days, availability used
  generated_by     TEXT NOT NULL CHECK (generated_by IN ('planner', 'agent')),
  unscheduled_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(unscheduled_json)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
) STRICT;

CREATE INDEX study_plans_created ON study_plans (created_at);

CREATE TABLE plan_items (
  id           TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'pli_*'),
  plan_id      TEXT NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
  date         TEXT NOT NULL,                          -- YYYY-MM-DD
  ordinal      INTEGER NOT NULL,                       -- order within the day
  kind         TEXT NOT NULL CHECK (kind IN ('review', 'practice', 'learn', 'coursework', 'mock_exam')),
  target_type  TEXT CHECK (target_type IS NULL OR target_type IN
                 ('module', 'concept', 'lecture', 'assessment', 'cards')),
  target_id    TEXT,                                   -- no key: the target can go away
  title        TEXT NOT NULL,
  minutes      INTEGER NOT NULL CHECK (minutes > 0),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped')),
  completed_at TEXT
) STRICT;

CREATE INDEX plan_items_day ON plan_items (plan_id, date, ordinal);

-- Hours the student reckons are left on a piece of coursework: the planner spreads them to the deadline.
ALTER TABLE assessments ADD COLUMN remaining_hours REAL
  CHECK (remaining_hours IS NULL OR (remaining_hours >= 0 AND remaining_hours <= 1000));

-- A tutored conversation keeps the answers it records in one practice quiz and attempt of its own, so
-- they are evidence like any other (flagged as assisted) and can be found again from the thread.
CREATE TABLE tutor_sessions (
  thread_id  TEXT PRIMARY KEY NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  quiz_id    TEXT NOT NULL REFERENCES quizzes (id),
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts (id),
  created_at TEXT NOT NULL
) STRICT;

-- A new kind of proposal: a correction to something the student wrote in a note. SQLite cannot change a
-- CHECK constraint in place, so the table is rebuilt with its rows.
CREATE TABLE proposals_next (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'prp_*'),
  kind          TEXT NOT NULL CHECK (kind IN ('concept', 'relation', 'alias', 'link', 'note', 'correction')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
  payload_json  TEXT NOT NULL CHECK (json_valid(payload_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  origin_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(origin_json)),
  dedupe_key    TEXT NOT NULL,
  result_json   TEXT,
  created_at    TEXT NOT NULL,
  decided_at    TEXT
) STRICT;

INSERT INTO proposals_next (id, kind, status, payload_json, evidence_json, origin_json, dedupe_key,
                            result_json, created_at, decided_at)
  SELECT id, kind, status, payload_json, evidence_json, origin_json, dedupe_key,
         result_json, created_at, decided_at
  FROM proposals;
DROP TABLE proposals;
ALTER TABLE proposals_next RENAME TO proposals;
CREATE INDEX proposals_status ON proposals (status, created_at);
CREATE INDEX proposals_key ON proposals (dedupe_key, status);
