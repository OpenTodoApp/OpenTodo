-- routines-shared-email (design D4): an Email project members message's stop
-- link and the members who stopped a routine's emails. Server state, never
-- synced or exported: delivery, not the routine's definition.
--
-- routine_email_links holds only the SHA-256 (hex) of each message's secret;
-- the secret exists only in the message. Links older than 365 days are
-- removed when a new one is minted.
CREATE TABLE IF NOT EXISTS routine_email_links (
  hash       TEXT PRIMARY KEY,
  rule_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS routine_email_links_created ON routine_email_links(created_at);

-- A member who stopped a routine's emails gets no more of them.
CREATE TABLE IF NOT EXISTS routine_email_stops (
  rule_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stopped_at INTEGER NOT NULL,
  PRIMARY KEY (rule_id, user_id)
) WITHOUT ROWID;
