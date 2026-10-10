-- Read-only MCP server (OpenSpec change `mcp-server`): API token scopes and the
-- shared owner settings table.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time. SQLite has no
-- ADD COLUMN IF NOT EXISTS, so the token scope (design D2/D6) lives in a side
-- table keyed by the token instead of a column on api_tokens: a missing row
-- means `full`, which is exactly what every token created before this change
-- keeps. Revoking a token (or deleting its account) removes the row with it.

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_token_scopes (
  token_id TEXT PRIMARY KEY REFERENCES api_tokens(id) ON DELETE CASCADE,
  scope    TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'read'))
);
