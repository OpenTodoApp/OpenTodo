-- MCP write tools (OpenSpec change `mcp-write-tools`): the `agent` token marker
-- and the per-user "Allow AI assistants to make changes" switch.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time (like 0021_mcp.sql).
--
-- An `agent` token is stored as a `read` row in api_token_scopes plus a row
-- here (design "Data model impact"). api_token_scopes keeps its CHECK of
-- ('full','read'), so a binary from before this change sees a plain `read`
-- token and refuses it on every write route: a downgrade fails safe.
CREATE TABLE IF NOT EXISTS api_token_agent (
  token_id TEXT PRIMARY KEY REFERENCES api_tokens(id) ON DELETE CASCADE
);

-- No row means off. Account state, not an op: it is never synced or exported.
CREATE TABLE IF NOT EXISTS user_agent_access (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allow_writes INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
