-- Weekly email digest (OpenSpec change `stats-and-review`, design D5): one row
-- per user who opted in. The schedule is server configuration the server acts
-- on, with server-only state (`last_sent_for`), so it is not an op-log entity.
--
-- weekday is 0–6 (0 = Sunday), hour 0–23, both in time_zone (an IANA name);
-- lang is one of the supported message languages. last_sent_for is the local
-- date (YYYY-MM-DD) the digest was sent or given up for, which keeps a restart
-- from sending a second digest that day. last_outcome is "sent", "skipped" or
-- the failed stage (connect, tls, auth, send, ...). origin is the server address
-- the settings were saved from, used for the review link when no
-- OPENTODO_BASE_URL is configured.
--
-- Server-side account data: never synced, never written to the op log.
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS email_digests (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 0,
  weekday         INTEGER NOT NULL DEFAULT 5,
  hour            INTEGER NOT NULL DEFAULT 7,
  time_zone       TEXT NOT NULL DEFAULT 'UTC',
  lang            TEXT NOT NULL DEFAULT 'en',
  origin          TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_sent_for   TEXT NOT NULL DEFAULT '',
  last_outcome    TEXT NOT NULL DEFAULT '',
  last_attempt_at INTEGER
);
CREATE INDEX IF NOT EXISTS email_digests_enabled ON email_digests(enabled);
