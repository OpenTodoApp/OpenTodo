-- Optional end-to-end encryption (OpenSpec change `e2ee`, design D8). Additive and
-- idempotent, so it survives renumbering when sibling changes land first.
--
-- One row per account that enabled encryption. It holds only what the browser
-- produced: the PBKDF2 salt and iteration count, and the account key wrapped
-- (AES-KW) once under the passphrase key and once under the recovery key. The
-- server cannot unwrap either: it never sees the passphrase, the recovery key or
-- the account key. `version` increases with every change (optimistic
-- concurrency, 409 `encryption_conflict`). Nothing here is synced as ops.
CREATE TABLE IF NOT EXISTS encryption_keys (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  kdf                INTEGER NOT NULL,
  salt               TEXT NOT NULL,
  iterations         INTEGER NOT NULL,
  wrapped_passphrase TEXT NOT NULL,
  wrapped_recovery   TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
