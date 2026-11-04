-- mcp-oauth: an OAuth 2.1 authorization server in front of the MCP endpoint
-- (design D3, D4, D6). Server state outside the op log, like the API tokens it
-- mints; no secret, code or refresh token is stored in the clear.

-- mcp_oauth_client is one registered client: the owner's from Settings, or
-- Google's from dynamic registration. secret_hash is empty for a client that
-- authenticates with PKCE alone.
CREATE TABLE IF NOT EXISTS mcp_oauth_client (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  secret_hash  TEXT NOT NULL DEFAULT '',
  -- redirect_uris is a JSON array. Dynamic clients only ever hold Google's
  -- oauth-redirect addresses; the owner's clients hold what they registered.
  redirect_uris TEXT NOT NULL,
  -- scope is the most a client may be granted: read or agent.
  scope        TEXT NOT NULL DEFAULT 'read',
  -- dynamic is 1 for a client that registered itself (RFC 7591).
  dynamic      INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

-- mcp_oauth_code is one pending authorization: single use, bound to the
-- client, the person, the redirect address and the PKCE challenge, and stored
-- as a hash so a database dump cannot be replayed (design D4).
CREATE TABLE IF NOT EXISTS mcp_oauth_code (
  code_hash    TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES mcp_oauth_client(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope        TEXT NOT NULL,
  challenge    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mcp_oauth_code_expires ON mcp_oauth_code(expires_at);

-- mcp_oauth_grant is one person's authorization of one client: the stable
-- refresh token and the access token currently issued from it (design D6). The
-- refresh token never rotates; token_id names the api_tokens row so a refresh
-- or a revocation can retire it.
CREATE TABLE IF NOT EXISTS mcp_oauth_grant (
  id                TEXT PRIMARY KEY,
  client_id         TEXT NOT NULL REFERENCES mcp_oauth_client(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL,
  scope             TEXT NOT NULL,
  refresh_hash      TEXT NOT NULL UNIQUE,
  token_id          TEXT NOT NULL DEFAULT '',
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked_at        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  -- One grant per client and person: a second authorization reuses it rather
  -- than stacking a second refresh token.
  UNIQUE(client_id, user_id)
);

CREATE INDEX IF NOT EXISTS mcp_oauth_grant_refresh ON mcp_oauth_grant(refresh_hash);
