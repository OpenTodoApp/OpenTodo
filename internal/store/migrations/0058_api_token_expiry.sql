-- api_token_expiry gives an API token an end (design D6, OpenSpec change mcp-oauth):
-- the access tokens an OAuth exchange mints last an hour. A side table keyed by the
-- token, like the scope markers, so a token without a row keeps never expiring and an
-- older binary reads every token as it always did.
--
-- It belongs to 0057_mcp_oauth.sql, which first shipped without it: the statement was
-- added to that file afterwards, so a server that had already applied it recorded 0057
-- as done and never created the table, and minting an OAuth access token then failed
-- with "no such table: api_token_expiry". A migration that has run is never edited, so
-- the statement lives here instead — idempotent, a no-op on a database that has it.
CREATE TABLE IF NOT EXISTS api_token_expiry (
  token_id   TEXT PRIMARY KEY REFERENCES api_tokens(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
