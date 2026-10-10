-- Single sign-on (OpenSpec change `oidc-login`). Additive and idempotent: every
-- statement can run again without error, so the file survives renumbering when
-- sibling changes land first. Nothing here is synced: it is server-side account
-- data, like sessions and API tokens.

-- Shared owner-level key/value settings (keys `oidc.*`). Created only if an
-- earlier migration (webhooks, audit-log, backups, mfa) has not.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER
);

-- External identities linked to accounts (design D3). An identity is matched
-- by (issuer, subject) only; `email` is a snapshot for display and is never
-- used to re-match once a link exists. Deleting the account removes its links.
CREATE TABLE IF NOT EXISTS identities (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer        TEXT NOT NULL,
  subject       TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE (issuer, subject)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);

-- The identity-token hint for provider sign-out (design D7), kept per session
-- that started through the provider. A one-to-one companion of `sessions`
-- instead of ALTER TABLE ADD COLUMN, which SQLite cannot run idempotently;
-- deleting the session deletes the hint.
CREATE TABLE IF NOT EXISTS session_oidc (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  id_token   TEXT NOT NULL
);
