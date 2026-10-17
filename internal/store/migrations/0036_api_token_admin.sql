-- Admin API tokens (OpenSpec change `route-authorization-policy`): the `admin`
-- token marker.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time (like 0026_mcp_write_tools.sql).
--
-- An `admin` token is stored as a `read` row in api_token_scopes plus a row
-- here, exactly like an `agent` token. api_token_scopes keeps its CHECK of
-- ('full','read'), so a binary from before this change sees a plain `read`
-- token and refuses it on every write route: a downgrade fails safe.
CREATE TABLE IF NOT EXISTS api_token_admin (
  token_id TEXT PRIMARY KEY REFERENCES api_tokens(id) ON DELETE CASCADE
);
