-- routines-describe-it: the part of assistant_usage that Describe it's
-- routine drafts used, per UTC month (design D4: usage tagged routine_draft).
-- Counts only, never the sentence or the draft.
CREATE TABLE IF NOT EXISTS assistant_usage_drafts (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  calls         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
