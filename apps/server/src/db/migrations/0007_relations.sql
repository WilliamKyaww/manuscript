-- 0007_relations — typed, provenance-tagged relations between graph nodes (Phase 7,
-- data-model.md §5.5, ADR-0020). CANONICAL (export required), except graph_communities (derived).
-- Wikilinks and course membership are computed when the graph is assembled, never stored here.

CREATE TABLE relations (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'rel_*'),
  from_type     TEXT NOT NULL CHECK (from_type IN ('concept', 'note', 'source', 'lecture', 'module', 'topic')),
  from_id       TEXT NOT NULL,
  to_type       TEXT NOT NULL CHECK (to_type IN ('concept', 'note', 'source', 'lecture', 'module', 'topic')),
  to_id         TEXT NOT NULL,
  relation      TEXT NOT NULL CHECK (relation IN ('relates_to', 'prerequisite_for', 'part_of', 'example_of',
                                                  'contrasts_with', 'covered_in', 'derived_from')),
  confidence    TEXT NOT NULL CHECK (confidence IN ('USER', 'EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
  score         REAL CHECK (score IS NULL OR score BETWEEN 0 AND 1),
  weight        REAL,                               -- FIRe encompassing weight (Phase 9), optional
  status        TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('proposed', 'accepted', 'rejected')),
  evidence_json TEXT NOT NULL DEFAULT '[]',         -- [{ quote?, locator? }]
  created_by    TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (from_id <> to_id),
  -- Symmetric relations are stored with the smaller id first, so each pair is stored once.
  UNIQUE (from_id, to_id, relation)
) STRICT;

CREATE INDEX relations_to ON relations (to_id);

-- Ends are polymorphic, so foreign keys cannot remove relations with their nodes. Canonical nodes
-- take their relations with them; notes are not covered, because the notes index is rebuilt from
-- the files and a relation to a note must survive that (it is skipped while the note is missing).
CREATE TRIGGER concepts_relations_delete AFTER DELETE ON concepts BEGIN
  DELETE FROM relations WHERE from_id = old.id OR to_id = old.id;
END;
CREATE TRIGGER lectures_relations_delete AFTER DELETE ON lectures BEGIN
  DELETE FROM relations WHERE from_id = old.id OR to_id = old.id;
END;
CREATE TRIGGER modules_relations_delete AFTER DELETE ON modules BEGIN
  DELETE FROM relations WHERE from_id = old.id OR to_id = old.id;
END;
CREATE TRIGGER topics_relations_delete AFTER DELETE ON topics BEGIN
  DELETE FROM relations WHERE from_id = old.id OR to_id = old.id;
END;
CREATE TRIGGER sources_relations_delete AFTER DELETE ON sources BEGIN
  DELETE FROM relations WHERE from_id = old.id OR to_id = old.id;
END;

-- Derived: the community each node was last placed in, so colours stay put between rebuilds.
CREATE TABLE graph_communities (
  node_id   TEXT    PRIMARY KEY NOT NULL,
  community INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
