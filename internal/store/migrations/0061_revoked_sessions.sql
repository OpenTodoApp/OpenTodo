-- revoked_sessions lets a device learn that its session was revoked on purpose,
-- as opposed to expired, so it removes its local copy (OpenSpec change
-- `revoked-device-wipe`); see internal/auth/revoke.go.
--
-- session_wipe_keys holds each browser session's wipe key: random bytes the
-- device receives from auth/status while signed in. It goes with the session.
CREATE TABLE IF NOT EXISTS session_wipe_keys (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  wipe_key   TEXT NOT NULL
);

-- revoked_sessions keeps a session ended by Sign out everywhere, deactivation or
-- deletion, with its wipe key, until keep_until (a year). No user id: once the
-- session is gone nothing here names a person.
CREATE TABLE IF NOT EXISTS revoked_sessions (
  token_hash TEXT PRIMARY KEY,
  wipe_key   TEXT NOT NULL,
  revoked_at INTEGER NOT NULL,
  keep_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS revoked_sessions_keep ON revoked_sessions(keep_until);
