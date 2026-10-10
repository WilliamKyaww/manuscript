-- 0013_chat — persistent chat threads (Phase 13, agent-system.md §§3, 4, 9, ADR-0036). CANONICAL
-- (export required): a conversation is the student's own record of what was asked, answered and done.
--
-- A thread keeps two views of its conversation: chat_messages are what the interface shows (text,
-- tool activity, citations); history_json is the conversation as the model needs it to carry on
-- (including tool calls and results), replaced by a summary when it grows too long.

CREATE TABLE chat_threads (
  id                 TEXT    PRIMARY KEY NOT NULL CHECK (id GLOB 'thr_*'),
  title              TEXT    NOT NULL,
  mode               TEXT    NOT NULL DEFAULT 'assistant' CHECK (mode IN ('assistant', 'tutor', 'read_only')),
  scope              TEXT    NOT NULL DEFAULT 'knowledge' CHECK (scope IN ('sources', 'knowledge', 'general')),
  filter_json        TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(filter_json)),
  -- Tools the student approved "for this chat" (never destructive ones: those always ask).
  allowed_tools_json TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_tools_json)),
  history_json       TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(history_json)),
  summary            TEXT    NOT NULL DEFAULT '',
  -- The run stopped to ask the student: what it was doing, to carry on when they answer.
  pending_json       TEXT    CHECK (pending_json IS NULL OR json_valid(pending_json)),
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cost               REAL    NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
) STRICT;

CREATE INDEX chat_threads_updated ON chat_threads (updated_at);

CREATE TABLE chat_messages (
  id            TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'msg_*'),
  thread_id     TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts_json    TEXT NOT NULL CHECK (json_valid(parts_json)),
  mentions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mentions_json)),
  -- The plain text of the parts, for finding a conversation again.
  text          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX chat_messages_thread ON chat_messages (thread_id, created_at);
