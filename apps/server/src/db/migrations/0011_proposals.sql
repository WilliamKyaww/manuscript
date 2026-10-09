-- 0011_proposals — the Inbox of AI proposals (Phase 11, knowledge-system.md §8, ADR-0034) and
-- transcription usage. Proposals are CANONICAL (export required): what the student accepted or
-- rejected is kept, so a rejected proposal is not made again.

CREATE TABLE proposals (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'prp_*'),
  kind          TEXT NOT NULL CHECK (kind IN ('concept', 'relation', 'alias', 'link', 'note')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
  payload_json  TEXT NOT NULL CHECK (json_valid(payload_json)),   -- @skb/core ProposalPayloadSchema
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  origin_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(origin_json)), -- task, scope, job
  -- What is proposed, normalised ("relation:con_a:prerequisite_for:con_b"), so the same thing is
  -- not proposed twice while pending, nor again once rejected.
  dedupe_key    TEXT NOT NULL,
  result_json   TEXT,                                -- what accepting made: { kind, id }
  created_at    TEXT NOT NULL,
  decided_at    TEXT
) STRICT;

CREATE INDEX proposals_status ON proposals (status, created_at);
CREATE INDEX proposals_key ON proposals (dedupe_key, status);

-- Transcription is a fourth model role. SQLite cannot change a CHECK constraint in place, so the
-- usage table is rebuilt with its rows (nothing refers to it).
CREATE TABLE ai_usage_next (
  id            TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'use_*'),
  role          TEXT    NOT NULL CHECK (role IN ('chat', 'fast', 'embedding', 'transcription')),
  provider      TEXT    NOT NULL,
  model         TEXT    NOT NULL,
  purpose       TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_estimate REAL    NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
) STRICT;

INSERT INTO ai_usage_next (id, role, provider, model, purpose, input_tokens, output_tokens,
                           cost_estimate, created_at)
  SELECT id, role, provider, model, purpose, input_tokens, output_tokens, cost_estimate, created_at
  FROM ai_usage;
DROP TABLE ai_usage;
ALTER TABLE ai_usage_next RENAME TO ai_usage;
CREATE INDEX ai_usage_time ON ai_usage (created_at);
