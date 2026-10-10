-- 0016_code_graphs — imported Graphify graphs of coursework repositories, and the links between the
-- code in them and the student's concepts (Phase 16, task 16.06, ADR-0039).
--
-- All four tables are CANONICAL: the original graph.json is not kept in the vault, so the rows are
-- what the student imported (and the links are what they decided). They are in every export.

CREATE TABLE code_graphs (
  id           TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'cgr_*'),
  name         TEXT    NOT NULL,
  module_id    TEXT    REFERENCES modules (id) ON DELETE SET NULL,
  file_name    TEXT    NOT NULL,
  sha256       TEXT    NOT NULL UNIQUE,           -- the same file is not imported twice
  entity_count INTEGER NOT NULL,
  edge_count   INTEGER NOT NULL,
  imported_at  TEXT    NOT NULL
) STRICT;

CREATE TABLE code_entities (
  id        TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'cod_*'),
  graph_id  TEXT NOT NULL REFERENCES code_graphs (id) ON DELETE CASCADE,
  key       TEXT NOT NULL,                        -- Graphify's id for the node, unique in its graph
  label     TEXT NOT NULL,
  kind      TEXT NOT NULL,                        -- Graphify's file_type
  file      TEXT,
  location  TEXT,
  rationale TEXT,
  UNIQUE (graph_id, key)
) STRICT;

CREATE INDEX code_entities_label ON code_entities (graph_id, label);

CREATE TABLE code_edges (
  id         INTEGER PRIMARY KEY,
  graph_id   TEXT    NOT NULL REFERENCES code_graphs (id) ON DELETE CASCADE,
  source_id  TEXT    NOT NULL REFERENCES code_entities (id) ON DELETE CASCADE,
  target_id  TEXT    NOT NULL REFERENCES code_entities (id) ON DELETE CASCADE,
  relation   TEXT    NOT NULL,                    -- calls, imports, contains … as Graphify wrote it
  confidence TEXT    NOT NULL CHECK (confidence IN ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
  score      REAL    CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  weight     REAL    NOT NULL DEFAULT 1
) STRICT;

CREATE INDEX code_edges_source ON code_edges (source_id);
CREATE INDEX code_edges_target ON code_edges (target_id);
CREATE INDEX code_edges_graph ON code_edges (graph_id);

-- Which code implements which concept. `proposed` ones come from matching names and wait for a decision;
-- a `rejected` one is kept so that it is not suggested again.
CREATE TABLE code_links (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  entity_id  TEXT NOT NULL REFERENCES code_entities (id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected')),
  score      REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  reason     TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'system')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (concept_id, entity_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX code_links_entity ON code_links (entity_id);
