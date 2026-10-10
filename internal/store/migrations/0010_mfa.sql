-- Second factor (OpenSpec change `mfa-totp`). Additive and idempotent: every
-- statement can run again without error, so the file survives renumbering when
-- sibling changes land first. Nothing here is synced: it is server-side account
-- data, like sessions and API tokens.

-- Shared owner-level key/value settings (policy key `mfa.required`). Created
-- only if another migration (webhooks, audit-log, backups, oidc-login) has not.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER
);

-- One authenticator per account. A row with confirmed_at NULL is a pending
-- enrolment (valid for ten minutes after created_at). The secret is base32 and
-- must be usable by the server, so it is stored as is: the data directory is the
-- trust boundary, as for webhook secrets (design D2).
CREATE TABLE IF NOT EXISTS mfa_totp (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret         TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  confirmed_at   INTEGER,
  last_used_step INTEGER NOT NULL DEFAULT 0
);

-- Single-use recovery codes, stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user ON mfa_recovery_codes(user_id);

-- Browsers that may skip the second step for 30 days (cookie `ot_trust`).
CREATE TABLE IF NOT EXISTS trusted_devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS trusted_devices_user ON trusted_devices(user_id);

-- Session freshness (design D4: `mfa_at`, `reauth_at`). Kept in a one-to-one
-- companion of `sessions` rather than ALTER TABLE ADD COLUMN, because SQLite has
-- no idempotent form of ADD COLUMN. Deleting a session deletes its row.
--   mfa_at:    when the second factor was last satisfied for this session
--   reauth_at: when the session last proved the password, a code or a passkey
CREATE TABLE IF NOT EXISTS session_auth (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  mfa_at     INTEGER,
  reauth_at  INTEGER
);
