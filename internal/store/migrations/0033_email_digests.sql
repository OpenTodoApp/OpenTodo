-- Weekly email digest settings (OpenSpec change `stats-and-review`, design D5):
-- one row per user who set it up. Server data the scheduler acts on, never
-- synced. last_sent_for is the user's local date of the last digest sent, so a
-- restart never sends a second one for the same day.
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS email_digests (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 0,
  weekday         INTEGER NOT NULL DEFAULT 5,
  hour            INTEGER NOT NULL DEFAULT 7,
  time_zone       TEXT NOT NULL DEFAULT 'UTC',
  lang            TEXT NOT NULL DEFAULT 'en',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_sent_for   TEXT,
  last_outcome    TEXT,
  last_attempt_at INTEGER
);
CREATE INDEX IF NOT EXISTS email_digests_enabled ON email_digests(enabled);
