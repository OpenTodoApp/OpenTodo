-- Verified open sign-up (OpenSpec change `outgoing-email`, design D4): with open
-- sign-up on and outgoing email configured, a registration stores a pending
-- sign-up and mails a link; the account is created only when the link is used.
-- One pending row per address (a new registration replaces it); only a hash of
-- the secret is stored, and the password is stored hashed as for accounts.
--
-- Server-side account data: never synced, never written to the op log.
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS signup_verifications (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS signup_verifications_expires ON signup_verifications(expires_at);
