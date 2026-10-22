-- settings-refresh (design D10): profile data on the account. Server-side account
-- data like the name set at sign-up: never an op, never synced.
--
-- avatar_version: 0 or less means no picture (a removed picture keeps its last
-- version negated, so the next one gets a new address); bumped on each set and part of
-- the picture's address, so it can be cached for a year. The picture itself is
-- <data>/avatars/<user id>.jpg.
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;

-- An email change waiting for the link sent to the new address.
ALTER TABLE users ADD COLUMN pending_email TEXT;
ALTER TABLE users ADD COLUMN pending_email_sent_at INTEGER;

-- Confirmation links for email changes: only the sha256 of the secret is stored,
-- like reset links. A newer request replaces the account's earlier rows.
CREATE TABLE IF NOT EXISTS email_changes (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_changes_user ON email_changes(user_id);
