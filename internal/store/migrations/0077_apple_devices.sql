-- iPhone registrations with the push relay (OpenSpec change ios-push-relay,
-- design D8): one row per device and session. Device state, not task data:
-- never an op, never synced, not in the user's export. A row goes with its
-- session (sign-out, revoked device, sign out everywhere) and with its user.
-- The APNs token and the due token are never stored: only the relay's sealed
-- handle, the wake key the server minted for it and the due token's SHA-256.
CREATE TABLE IF NOT EXISTS apple_devices (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash       TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  device_id          TEXT NOT NULL,
  handle             TEXT NOT NULL,
  handle_expires_at  INTEGER NOT NULL,          -- Unix ms
  wake_key           TEXT NOT NULL,             -- base64url, 32 bytes
  due_token_hash     TEXT NOT NULL,             -- hex SHA-256 of the phone's due token
  include_content    INTEGER NOT NULL DEFAULT 0,
  schedule_cursor    INTEGER NOT NULL DEFAULT 0, -- the op-log sequence the phone's schedule reflects
  scheduled_until    INTEGER NOT NULL DEFAULT 0, -- Unix ms the phone's schedule reaches
  last_refresh_at    INTEGER,
  pending_refresh_at INTEGER,
  last_due_at        INTEGER,
  failures           INTEGER NOT NULL DEFAULT 0,
  failing_since      INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE (user_id, device_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS apple_devices_due_token ON apple_devices(due_token_hash);
CREATE INDEX IF NOT EXISTS apple_devices_session ON apple_devices(session_hash);
