-- Member's own assistant provider (OpenSpec change `assistant-member-provider`):
-- the provider and model a member chose for their own key, and the share of a
-- month's usage that ran on a member's own key.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time (like 0021_mcp.sql).
--
-- Both tables are server state, not ops: never synced or exported. They hold
-- no key (keys stay in <data>/secrets/assistant.json) and no task content.

-- No row means "use the server's assistant". provider is anthropic, openai or
-- gemini (never compatible: members cannot point the server at a host).
CREATE TABLE IF NOT EXISTS assistant_member_provider (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The part of assistant_usage (which counts every turn) that ran on the
-- member's own key, so the monthly cap can leave it out.
CREATE TABLE IF NOT EXISTS assistant_usage_own_key (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL, -- UTC calendar month, YYYY-MM
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  turns         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
