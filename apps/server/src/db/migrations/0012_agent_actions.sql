-- 0012_agent_actions — the audit log of what the agent (or an MCP client) did (Phase 12,
-- agent-system.md §8, ADR-0013, ADR-0035). CANONICAL (export required) and append-only in spirit:
-- rows are never deleted; undoing an action marks it 'undone' and logs nothing else away.
--
-- Only calls that change something, and calls that were refused, are recorded: reads are not (they
-- would drown the rest). What is needed to undo a call is kept as small JSON (undo_json) and, for
-- files, as copies under <vault>/.skb/history/<action id>/ (snapshot_ref).

CREATE TABLE agent_actions (
  id           TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'act_*'),
  thread_id    TEXT,                                   -- the chat thread (Phase 13); no key until it exists
  message_id   TEXT,
  actor        TEXT NOT NULL CHECK (actor IN ('agent', 'mcp')),
  tool         TEXT NOT NULL,
  risk         TEXT NOT NULL CHECK (risk IN ('read', 'write', 'destructive')),
  approval     TEXT CHECK (approval IS NULL OR approval IN ('auto', 'user')),
  status       TEXT NOT NULL CHECK (status IN ('executed', 'denied', 'failed', 'undone')),
  summary      TEXT NOT NULL,
  input_json   TEXT NOT NULL CHECK (json_valid(input_json)),
  output_json  TEXT CHECK (output_json IS NULL OR json_valid(output_json)),
  error        TEXT,
  undo_json    TEXT CHECK (undo_json IS NULL OR json_valid(undo_json)),
  snapshot_ref TEXT,
  created_at   TEXT NOT NULL,
  undone_at    TEXT
) STRICT;

CREATE INDEX agent_actions_time ON agent_actions (created_at);
CREATE INDEX agent_actions_thread ON agent_actions (thread_id, created_at) WHERE thread_id IS NOT NULL;

-- The log is evidence: nothing is deleted from it, and only an undo changes a row.
CREATE TRIGGER agent_actions_no_delete BEFORE DELETE ON agent_actions BEGIN
  SELECT RAISE(ABORT, 'the agent action log is append-only');
END;
CREATE TRIGGER agent_actions_only_undo BEFORE UPDATE ON agent_actions
WHEN OLD.status <> 'executed' OR NEW.status <> 'undone'
  OR NEW.id IS NOT OLD.id OR NEW.tool IS NOT OLD.tool OR NEW.input_json IS NOT OLD.input_json
  OR NEW.output_json IS NOT OLD.output_json OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'an agent action can only be marked undone');
END;
