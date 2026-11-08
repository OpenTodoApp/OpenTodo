-- limit_windows keeps the open windows of the rate limits and AI agent limits,
-- so a restart does not reset them (OpenSpec change `persistent-limits`); see
-- internal/ratelimit. Checks read memory; the tenant's limits job writes the
-- windows that changed and removes the ended ones.
--
-- limiter names the limit ("login", "account", "agent", ...); key is a hash of
-- the counted key (a client address, an account, a token, a recipient) keyed
-- with this database's salt, never the key itself. start and ends are Unix
-- milliseconds; hits holds a sliding window's times, comma-separated.
CREATE TABLE IF NOT EXISTS limit_windows (
  limiter TEXT NOT NULL,
  key     TEXT NOT NULL,
  start   INTEGER NOT NULL,
  ends    INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  refused INTEGER NOT NULL DEFAULT 0,
  hits    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (limiter, key)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS limit_windows_ends ON limit_windows(ends);
