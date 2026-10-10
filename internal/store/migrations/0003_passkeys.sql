-- Passkeys (WebAuthn credentials). Additive; independent of 0002. The WebAuthn
-- user handle is users.id, so no column is added to users. Nothing here is
-- synced: credentials are server-side account data.
CREATE TABLE passkeys (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  credential_id   BLOB NOT NULL UNIQUE,
  public_key      BLOB NOT NULL,
  alg             INTEGER NOT NULL,
  sign_count      INTEGER NOT NULL DEFAULT 0,
  transports      TEXT NOT NULL DEFAULT '',
  backup_eligible INTEGER NOT NULL DEFAULT 0,
  backed_up       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  last_used_at    INTEGER,
  suspicious_at   INTEGER
);
CREATE INDEX passkeys_user ON passkeys(user_id);
