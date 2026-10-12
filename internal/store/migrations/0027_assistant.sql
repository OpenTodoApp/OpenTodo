-- In-app assistant (OpenSpec change `in-app-assistant`): monthly token usage
-- per user and each user's consent to send task content to a model provider.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time (like 0021_mcp.sql).
--
-- Both tables are server state, not ops: never synced, exported or backed up
-- beyond the database snapshot itself, and they hold no task content.
CREATE TABLE IF NOT EXISTS assistant_usage (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL, -- UTC calendar month, YYYY-MM
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  turns         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- No row means no consent. provider is the provider the disclosure named.
CREATE TABLE IF NOT EXISTS assistant_consent (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accepted_at        INTEGER NOT NULL,
  disclosure_version INTEGER NOT NULL,
  provider           TEXT NOT NULL
);
