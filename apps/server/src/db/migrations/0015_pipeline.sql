-- 0015_pipeline — runs of the lecture pipeline, and a new kind of proposal: an addition to a note
-- (Phase 15, ADR-0038).
--
-- A run is derived record-keeping (what the pipeline did for a lecture and when), kept so the lecture
-- page can say what came of it. What it made lives in the Inbox and the knowledge base as usual.

CREATE TABLE pipeline_runs (
  id          TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'run_*'),
  lecture_id  TEXT NOT NULL,                           -- no key: the lecture can go, the record stays
  trigger     TEXT NOT NULL CHECK (trigger IN ('manual', 'auto')),
  steps_json  TEXT NOT NULL CHECK (json_valid(steps_json)),   -- [{ step, status, summary }]
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json)),  -- the material it ran over
  job_id      TEXT,
  status      TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  message     TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT
) STRICT;

CREATE INDEX pipeline_runs_lecture ON pipeline_runs (lecture_id, started_at);

-- Proposals gain the kind 'addition' (text to add under a heading of a note). SQLite cannot change a
-- CHECK constraint in place, so the table is rebuilt with its rows.
CREATE TABLE proposals_next (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'prp_*'),
  kind          TEXT NOT NULL CHECK (kind IN ('concept', 'relation', 'alias', 'link', 'note', 'correction', 'addition')),
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
