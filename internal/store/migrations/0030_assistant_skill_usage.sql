-- assistant-skills (design D2): how often each built-in skill ran, per user and
-- UTC month, next to assistant_usage. No conversation content is stored.
CREATE TABLE IF NOT EXISTS assistant_skill_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL, -- UTC calendar month, YYYY-MM
  skill   TEXT NOT NULL,
  turns   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month, skill)
);
