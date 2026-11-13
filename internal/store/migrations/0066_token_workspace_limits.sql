-- Tokens limited to chosen workspaces (OpenSpec change token-workspaces, D1):
-- one row per workspace a token may reach; no rows means every workspace.
-- Written with the token, never changed, removed with it. Such a token's
-- secret starts with otw_ and is stored under a different hash (D1), so a
-- binary from before this change, which would ignore these rows, cannot
-- resolve it at all: a downgrade makes it stop working, never widens it.
-- Idempotent, like every migration here.

CREATE TABLE IF NOT EXISTS api_token_workspaces (
  token_id     TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  PRIMARY KEY (token_id, workspace_id)
);
