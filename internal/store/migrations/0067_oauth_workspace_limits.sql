-- An app connected over MCP OAuth limited to chosen workspaces (OpenSpec change
-- token-workspaces, D5): the choice made on the consent page, kept with the
-- pending code and then with the grant, and given to every access token the
-- grant mints. No rows means every workspace. A limited grant's refresh token
-- starts with otwr_ and is stored under a different hash, so a binary from
-- before this change cannot refresh it (and mint an unlimited token): the app
-- is asked to authorize again instead. Idempotent.

CREATE TABLE IF NOT EXISTS mcp_oauth_code_workspaces (
  code_hash    TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  PRIMARY KEY (code_hash, workspace_id)
);

CREATE TABLE IF NOT EXISTS mcp_oauth_grant_workspaces (
  grant_id     TEXT NOT NULL REFERENCES mcp_oauth_grant(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  PRIMARY KEY (grant_id, workspace_id)
);
