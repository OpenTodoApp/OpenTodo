-- Reminders and web push (OpenSpec change `reminders`). Reminders themselves are
-- op-log entities (fields/ops tables); this migration only adds device push
-- subscriptions, which are server-side device state outside the op log and the
-- export, plus an index for the reminder scheduler. Every statement is idempotent.

-- One subscription per (user, device). session_hash ties a subscription to the
-- browser session that created it: signing out or revoking that session deletes
-- the row through the cascade (NULL when created with an API token).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  session_hash    TEXT REFERENCES sessions(token_hash) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  include_content INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_ok_at      INTEGER,
  last_error      TEXT NOT NULL DEFAULT '',
  failures        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_session ON push_subscriptions(session_hash);

-- The scheduler scans reminder.fire_at values; keep that scan off the task rows.
CREATE INDEX IF NOT EXISTS fields_reminder_field ON fields(field, user_id, entity_id) WHERE entity = 'reminder';
