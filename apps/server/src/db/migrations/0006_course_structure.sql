-- 0006_course_structure — courses, modules, lectures, topics, assessments and concepts (Phase 6).
-- All CANONICAL (export required, data-model.md §6), except note_links (derived, rebuilt here so it
-- can point at concepts). Associations recorded in note files — a note's `module` and `lecture`
-- properties — are read from the notes index, not copied here (ADR-0029).

CREATE TABLE courses (
  id             TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'crs_*'),
  title          TEXT NOT NULL,
  start_date     TEXT,                              -- YYYY-MM-DD
  end_date       TEXT,
  target_average REAL CHECK (target_average IS NULL OR target_average BETWEEN 0 AND 100),
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
) STRICT;

CREATE TABLE modules (
  id          TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'mod_*'),
  course_id   TEXT    REFERENCES courses (id) ON DELETE SET NULL,
  code        TEXT    NOT NULL,                     -- as shown; also the Sources/<code>/ folder name
  code_key    TEXT    NOT NULL UNIQUE,              -- lower case, for matching files case-insensitively
  title       TEXT    NOT NULL,
  credits     REAL    CHECK (credits IS NULL OR credits >= 0),
  semester    TEXT,
  colour      TEXT,                                 -- #rrggbb
  target_mark REAL    CHECK (target_mark IS NULL OR target_mark BETWEEN 0 AND 100),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
) STRICT;

CREATE INDEX modules_course ON modules (course_id) WHERE course_id IS NOT NULL;

CREATE TABLE lectures (
  id         TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'lec_*'),
  module_id  TEXT    NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  key        TEXT    NOT NULL,                      -- e.g. L03; notes write `lecture: COC251/L03`
  key_norm   TEXT    NOT NULL,                      -- lower case
  title      TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('lecture', 'lab', 'tutorial', 'workshop', 'seminar')),
  week       INTEGER,
  held_on    TEXT,                                  -- YYYY-MM-DD
  ordinal    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  UNIQUE (module_id, key_norm)
) STRICT;

CREATE TABLE lecture_sources (
  lecture_id TEXT NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  source_id  TEXT NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (lecture_id, source_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX lecture_sources_source ON lecture_sources (source_id);

CREATE TABLE topics (
  id         TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'top_*'),
  module_id  TEXT    NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  parent_id  TEXT    REFERENCES topics (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  ordinal    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
) STRICT;

CREATE INDEX topics_module ON topics (module_id, parent_id, ordinal);

CREATE TABLE assessments (
  id               TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'asm_*'),
  module_id        TEXT    NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  kind             TEXT    NOT NULL CHECK (kind IN ('exam', 'coursework', 'test', 'presentation', 'project')),
  weight           REAL    NOT NULL CHECK (weight > 0 AND weight <= 1),   -- fraction of the module mark
  due_at           TEXT,                            -- YYYY-MM-DD or YYYY-MM-DDTHH:MM
  duration_minutes INTEGER,
  status           TEXT    NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'submitted', 'marked')),
  mark_achieved    REAL    CHECK (mark_achieved IS NULL OR mark_achieved BETWEEN 0 AND 100),
  notes            TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
) STRICT;

CREATE INDEX assessments_module ON assessments (module_id);
CREATE INDEX assessments_due ON assessments (due_at) WHERE due_at IS NOT NULL;

CREATE TABLE concepts (
  id          TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'con_*'),
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL UNIQUE,                 -- case-folded; shares a namespace with aliases
  slug        TEXT NOT NULL UNIQUE,
  summary     TEXT NOT NULL DEFAULT '',
  note_id     TEXT,                                 -- backing note (by note id)
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('proposed', 'active', 'merged', 'rejected')),
  merged_into TEXT REFERENCES concepts (id) ON DELETE SET NULL,
  importance  REAL NOT NULL DEFAULT 1 CHECK (importance BETWEEN 0.5 AND 2),
  created_by  TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) STRICT;

CREATE TABLE concept_aliases (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  alias      TEXT NOT NULL,
  alias_key  TEXT NOT NULL UNIQUE,
  PRIMARY KEY (concept_id, alias_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE concept_modules (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  module_id  TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, module_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX concept_modules_module ON concept_modules (module_id);

CREATE TABLE concept_topics (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, topic_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX concept_topics_topic ON concept_topics (topic_id);

-- note_links can now resolve to a concept (knowledge-system.md §3). SQLite cannot change a CHECK
-- constraint in place, so the derived table is rebuilt with its rows copied.
CREATE TABLE note_links_new (
  link_id         INTEGER PRIMARY KEY,
  source_doc      INTEGER NOT NULL REFERENCES notes (doc_id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  syntax          TEXT    NOT NULL CHECK (syntax IN ('wikilink', 'markdown')),
  embed           INTEGER NOT NULL CHECK (embed IN (0, 1)),
  target_raw      TEXT    NOT NULL,
  target_name_key TEXT    NOT NULL,
  heading         TEXT,
  block_ref       TEXT,
  alias           TEXT,
  target_kind     TEXT    NOT NULL CHECK (target_kind IN ('note', 'attachment', 'concept', 'unresolved')),
  target_doc      INTEGER REFERENCES notes (doc_id) ON DELETE SET NULL,
  target_path     TEXT,
  target_concept  TEXT    REFERENCES concepts (id) ON DELETE SET NULL,
  ambiguous       INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous IN (0, 1)),
  line            INTEGER NOT NULL,
  col             INTEGER NOT NULL,
  context         TEXT    NOT NULL
) STRICT;

INSERT INTO note_links_new (link_id, source_doc, ordinal, syntax, embed, target_raw, target_name_key,
  heading, block_ref, alias, target_kind, target_doc, target_path, ambiguous, line, col, context)
SELECT link_id, source_doc, ordinal, syntax, embed, target_raw, target_name_key,
  heading, block_ref, alias, target_kind, target_doc, target_path, ambiguous, line, col, context
FROM note_links;

DROP TABLE note_links;
ALTER TABLE note_links_new RENAME TO note_links;

CREATE INDEX note_links_source ON note_links (source_doc, ordinal);
CREATE INDEX note_links_target ON note_links (target_doc) WHERE target_doc IS NOT NULL;
CREATE INDEX note_links_name_key ON note_links (target_name_key);
CREATE INDEX note_links_concept ON note_links (target_concept) WHERE target_concept IS NOT NULL;
