-- 0003_recent_items — what the user opened recently, for the quick switcher (canonical, low stakes).
-- Items are referenced by their public id; entries whose item no longer exists are skipped on read.
CREATE TABLE recent_items (
  kind      TEXT NOT NULL,                       -- 'note' (sources and concepts in later phases)
  item_id   TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (kind, item_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX recent_items_opened ON recent_items (kind, opened_at DESC);
