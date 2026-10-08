-- 0005_sources — background jobs and the source library (Phase 5, ADR-0008, ADR-0010, ADR-0019).
-- jobs and sources are CANONICAL (a source row carries its module and later its references);
-- source_sections, chunks and chunks_fts are DERIVED from the original files and are rebuilt by
-- re-ingestion. Originals live in the vault under Sources/ and are never modified.

CREATE TABLE jobs (
  id           TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'job_*'),
  kind         TEXT    NOT NULL,                   -- e.g. 'source.ingest'
  subject      TEXT,                               -- entity worked on (e.g. a source id)
  payload_json TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  status       TEXT    NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress     REAL    NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
  message      TEXT,                               -- current step, for the UI
  error        TEXT,                               -- last failure, user-facing
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  run_after    TEXT    NOT NULL,                   -- not before this time (retry back-off)
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  finished_at  TEXT
) STRICT;

CREATE INDEX jobs_queue ON jobs (run_after, created_at) WHERE status = 'queued';
CREATE INDEX jobs_subject ON jobs (subject, created_at) WHERE subject IS NOT NULL;
CREATE INDEX jobs_finished ON jobs (finished_at) WHERE finished_at IS NOT NULL;

CREATE TABLE sources (
  id              TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'src_*'),
  kind            TEXT    NOT NULL CHECK (kind IN ('pdf', 'pptx', 'docx', 'markdown', 'text', 'url', 'audio', 'video', 'image')),
  title           TEXT    NOT NULL,
  path            TEXT    NOT NULL,                -- vault-relative original, '/'-separated
  original_name   TEXT    NOT NULL,                -- file name as imported
  media_type      TEXT    NOT NULL,
  sha256          TEXT    NOT NULL,                -- of the original's bytes
  size_bytes      INTEGER NOT NULL,
  mtime_ms        INTEGER NOT NULL,                -- lets reconciliation skip re-hashing unchanged files
  page_count      INTEGER,
  status          TEXT    NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error           TEXT,
  module_code     TEXT,                            -- Sources/<module>/; NULL for the inbox
  url             TEXT,                            -- web imports (later)
  metadata_json   TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  warnings_json   TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  parser_version  TEXT,                            -- parser that produced the current sections
  ingested_sha256 TEXT,                            -- content the current sections came from
  created_at      TEXT    NOT NULL,
  ingested_at     TEXT,
  missing_at      TEXT,                            -- the original disappeared from the vault
  deleted_at      TEXT                             -- moved to the trash through the app
) STRICT;

CREATE UNIQUE INDEX sources_path ON sources (path) WHERE deleted_at IS NULL;
CREATE INDEX sources_sha256 ON sources (sha256);
CREATE INDEX sources_module ON sources (module_code) WHERE module_code IS NOT NULL;

CREATE TABLE source_sections (
  id                INTEGER PRIMARY KEY,           -- internal; derived rows are replaced on re-ingestion
  source_id         TEXT    NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  ordinal           INTEGER NOT NULL,
  kind              TEXT    NOT NULL CHECK (kind IN ('page', 'slide', 'heading', 'segment')),
  label             TEXT    NOT NULL,              -- "p. 12", "Slide 3", a heading
  heading_path_json TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(heading_path_json)),
  locator_json      TEXT    NOT NULL CHECK (json_valid(locator_json)),
  text              TEXT    NOT NULL,
  notes             TEXT,                          -- speaker notes (slides)
  UNIQUE (source_id, ordinal)
) STRICT;

CREATE TABLE chunks (
  id             INTEGER PRIMARY KEY,              -- also the chunks_fts rowid
  owner_type     TEXT    NOT NULL CHECK (owner_type IN ('source', 'note')),
  owner_id       TEXT    NOT NULL,
  section_id     INTEGER REFERENCES source_sections (id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  text           TEXT    NOT NULL,
  context_prefix TEXT    NOT NULL,                 -- "Document › section"
  token_estimate INTEGER NOT NULL,
  locator_json   TEXT    NOT NULL CHECK (json_valid(locator_json))
) STRICT;

CREATE INDEX chunks_owner ON chunks (owner_type, owner_id, ordinal);
CREATE INDEX chunks_section ON chunks (section_id);

-- External-content FTS: the text is stored once (in chunks) and kept in step by triggers, which
-- also fire for rows removed by ON DELETE CASCADE.
CREATE VIRTUAL TABLE chunks_fts USING fts5 (
  context_prefix,
  text,
  content = 'chunks',
  content_rowid = 'id',
  tokenize = 'porter unicode61 remove_diacritics 2'
);
INSERT INTO chunks_fts (chunks_fts, rank) VALUES ('rank', 'bm25(2.0, 1.0)');

CREATE TRIGGER chunks_after_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, context_prefix, text) VALUES (new.id, new.context_prefix, new.text);
END;

CREATE TRIGGER chunks_after_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, context_prefix, text)
  VALUES ('delete', old.id, old.context_prefix, old.text);
END;

CREATE TRIGGER chunks_after_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, context_prefix, text)
  VALUES ('delete', old.id, old.context_prefix, old.text);
  INSERT INTO chunks_fts (rowid, context_prefix, text) VALUES (new.id, new.context_prefix, new.text);
END;
