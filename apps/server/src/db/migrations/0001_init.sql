-- 0001_init — vault-scoped, non-secret settings (canonical).
-- Secrets (API keys) never live in the vault database; see ADR-0005.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
) STRICT;
