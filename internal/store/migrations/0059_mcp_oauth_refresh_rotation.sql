-- mcp_oauth_refresh_used remembers the refresh tokens a rotating grant has
-- already exchanged (OpenSpec change mcp-oauth-refresh-rotation). A refresh
-- replaces the grant's refresh_hash with a new token's and records the old hash
-- here; when an old token comes back, the grant (the token family) is revoked.
-- Rows are kept for as long as the token could have lived unrotated
-- (mcpoauth.RefreshTTL) and go with their grant.
CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_used (
  refresh_hash TEXT PRIMARY KEY,
  grant_id     TEXT NOT NULL REFERENCES mcp_oauth_grant(id) ON DELETE CASCADE,
  used_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_used_grant ON mcp_oauth_refresh_used(grant_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_used_at ON mcp_oauth_refresh_used(used_at);
