-- app-sign-in (OpenSpec change native-app-foundation, design D5): the OpenTodo
-- app signs in through the system browser with an authorization code and PKCE.
-- Server state outside the op log, like the MCP OAuth tables it builds on; no
-- code, refresh token or state is stored in the clear.

-- The built-in public client. It holds no secret and no redirect address, so
-- the MCP endpoints never accept it, and it is left out of the owner's client
-- list.
INSERT INTO mcp_oauth_client(id,name,secret_hash,redirect_uris,scope,dynamic,created_by,created_at)
  VALUES('opentodo-app','OpenTodo app','','[]','app',0,'',0)
  ON CONFLICT(id) DO NOTHING;

-- app_sign_in_code is one confirmed sign-in waiting for the app's exchange:
-- single use, bound to the PKCE challenge and the state (its hash), carrying
-- the device name the app sent for the grant it becomes. Like mcp_oauth_code,
-- but with the state and the device, which that table has no column for.
CREATE TABLE IF NOT EXISTS app_sign_in_code (
  code_hash  TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL DEFAULT 'opentodo-app' REFERENCES mcp_oauth_client(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  device     TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sign_in_code_expires ON app_sign_in_code(expires_at);

-- app_sign_in_grant is one signed-in app: one per device, unlike an MCP grant,
-- which is one per client and person. The refresh token rotates on every use;
-- token_id names the api_tokens row of the current access token. Revoking a
-- grant deletes its row, so every token of it is unknown from then on.
CREATE TABLE IF NOT EXISTS app_sign_in_grant (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device             TEXT NOT NULL DEFAULT '',
  refresh_hash       TEXT NOT NULL UNIQUE,
  token_id           TEXT NOT NULL DEFAULT '',
  refresh_expires_at INTEGER NOT NULL,
  created_at         INTEGER NOT NULL,
  last_used_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sign_in_grant_user ON app_sign_in_grant(user_id);

-- The refresh tokens a grant already exchanged: one coming back revokes the
-- grant (reuse detection, RFC 6819 §5.2.2.3).
CREATE TABLE IF NOT EXISTS app_sign_in_refresh_used (
  refresh_hash TEXT PRIMARY KEY,
  grant_id     TEXT NOT NULL REFERENCES app_sign_in_grant(id) ON DELETE CASCADE,
  used_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sign_in_refresh_used_grant ON app_sign_in_refresh_used(grant_id);

-- api_token_app marks an access token of the app: the `app` scope. It is
-- stored as a `full` scope row plus this marker, so a server downgraded to a
-- version without the scope reads it as `full`, which is what `app` grants.
CREATE TABLE IF NOT EXISTS api_token_app (
  token_id TEXT PRIMARY KEY REFERENCES api_tokens(id) ON DELETE CASCADE
);
