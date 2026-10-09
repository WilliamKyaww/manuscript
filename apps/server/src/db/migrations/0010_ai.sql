-- 0010_ai — AI usage records (CANONICAL: what was spent, kept for budgets and the student's own
-- record) and embeddings (DERIVED: rebuilt from chunks and notes whenever the embedding model
-- changes). Phase 10, agent-system.md §2 and §12, ADR-0010, ADR-0033.

CREATE TABLE ai_usage (
  id            TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'use_*'),
  role          TEXT    NOT NULL CHECK (role IN ('chat', 'fast', 'embedding')),
  provider      TEXT    NOT NULL,                   -- provider id in the settings, or 'mock'
  model         TEXT    NOT NULL,
  purpose       TEXT    NOT NULL,                   -- 'ask', 'embed', 'connection test', …
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL    NOT NULL DEFAULT 0,         -- US dollars, from the prices set at the time
  created_at    TEXT    NOT NULL
) STRICT;

CREATE INDEX ai_usage_time ON ai_usage (created_at);

-- One vector per chunk or note and embedding model ("provider/model"). The text's hash tells when
-- an owner changed and needs embedding again. Vectors are little-endian float32.
CREATE TABLE embeddings (
  owner_type   TEXT    NOT NULL CHECK (owner_type IN ('chunk', 'note')),
  owner_id     TEXT    NOT NULL,                    -- chunks.id as text, or notes.id
  model        TEXT    NOT NULL,
  content_hash TEXT    NOT NULL,
  dims         INTEGER NOT NULL CHECK (dims > 0),
  vector       BLOB    NOT NULL,
  created_at   TEXT    NOT NULL,
  PRIMARY KEY (owner_type, owner_id, model)
) STRICT, WITHOUT ROWID;

CREATE INDEX embeddings_model ON embeddings (model);
