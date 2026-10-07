-- 0002_notes — index of the vault's Markdown notes and attachments.
-- Everything here is DERIVED from the files and can be rebuilt by deleting .skb/ (ADR-0004);
-- the only exception is a note id that has not yet been written into its file's frontmatter.

CREATE TABLE notes (
  doc_id           INTEGER PRIMARY KEY,            -- internal row id; also the notes_fts rowid
  id               TEXT    NOT NULL UNIQUE CHECK (id GLOB 'note_*'),
  path             TEXT    NOT NULL UNIQUE,        -- vault-relative, '/'-separated
  path_key         TEXT    NOT NULL,               -- normalised (NFC, lower case, no .md)
  name_key         TEXT    NOT NULL,               -- normalised file name without .md
  title            TEXT    NOT NULL,
  title_key        TEXT    NOT NULL,
  type             TEXT,
  module_code      TEXT,
  lecture_key      TEXT,
  frontmatter_json TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(frontmatter_json)),
  content_hash     TEXT    NOT NULL,               -- sha256 of the file bytes
  size_bytes       INTEGER NOT NULL,
  mtime_ms         INTEGER NOT NULL,
  word_count       INTEGER NOT NULL,
  id_persisted     INTEGER NOT NULL DEFAULT 0 CHECK (id_persisted IN (0, 1)),
  warnings_json    TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)),
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  indexed_at       TEXT    NOT NULL
) STRICT;

CREATE INDEX notes_path_key ON notes (path_key);
CREATE INDEX notes_name_key ON notes (name_key);
CREATE INDEX notes_title_key ON notes (title_key);
CREATE INDEX notes_module ON notes (module_code) WHERE module_code IS NOT NULL;
CREATE INDEX notes_lecture ON notes (lecture_key) WHERE lecture_key IS NOT NULL;

CREATE TABLE note_aliases (
  doc_id    INTEGER NOT NULL REFERENCES notes (doc_id) ON DELETE CASCADE,
  alias     TEXT    NOT NULL,
  alias_key TEXT    NOT NULL,
  PRIMARY KEY (doc_id, alias_key)
) STRICT, WITHOUT ROWID;

CREATE INDEX note_aliases_key ON note_aliases (alias_key);

CREATE TABLE note_tags (
  doc_id INTEGER NOT NULL REFERENCES notes (doc_id) ON DELETE CASCADE,
  tag    TEXT    NOT NULL,                         -- lower case, '/' hierarchy allowed
  PRIMARY KEY (doc_id, tag)
) STRICT, WITHOUT ROWID;

CREATE INDEX note_tags_tag ON note_tags (tag);

CREATE TABLE note_links (
  link_id         INTEGER PRIMARY KEY,
  source_doc      INTEGER NOT NULL REFERENCES notes (doc_id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,                -- position among the source note's links
  syntax          TEXT    NOT NULL CHECK (syntax IN ('wikilink', 'markdown')),
  embed           INTEGER NOT NULL CHECK (embed IN (0, 1)),
  target_raw      TEXT    NOT NULL,                -- as written, without #heading
  target_name_key TEXT    NOT NULL,                -- normalised last path segment; '' for same-note links
  heading         TEXT,
  block_ref       TEXT,
  alias           TEXT,
  target_kind     TEXT    NOT NULL CHECK (target_kind IN ('note', 'attachment', 'unresolved')),
  target_doc      INTEGER REFERENCES notes (doc_id) ON DELETE SET NULL,
  target_path     TEXT,
  ambiguous       INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous IN (0, 1)),
  line            INTEGER NOT NULL,
  col             INTEGER NOT NULL,
  context         TEXT    NOT NULL                 -- the source line, for backlink display
) STRICT;

CREATE INDEX note_links_source ON note_links (source_doc, ordinal);
CREATE INDEX note_links_target ON note_links (target_doc) WHERE target_doc IS NOT NULL;
CREATE INDEX note_links_name_key ON note_links (target_name_key);

CREATE TABLE attachments (
  path       TEXT    PRIMARY KEY NOT NULL,         -- vault-relative, '/'-separated
  name_key   TEXT    NOT NULL,                     -- normalised file name with extension
  size_bytes INTEGER NOT NULL,
  mtime_ms   INTEGER NOT NULL,
  media_type TEXT    NOT NULL,
  indexed_at TEXT    NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX attachments_name_key ON attachments (name_key);

-- Full-text index (BM25 weights are applied at query time in Phase 4).
CREATE VIRTUAL TABLE notes_fts USING fts5 (
  title,
  headings,
  body,
  tags,
  tokenize = 'porter unicode61 remove_diacritics 2'
);
