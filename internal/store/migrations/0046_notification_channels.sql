-- notification-channels (design D8): a user's delivery channels (ntfy, Pushover,
-- Gotify, a webhook) and the durable queue of messages sent to them. Server data
-- only: nothing here is in the op log or the export; tokens, user keys and
-- signing secrets live in <data>/secrets/notification-channels.json, never here.
CREATE TABLE IF NOT EXISTS notification_channels (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL,              -- ntfy | pushover | gotify | webhook
  name                 TEXT NOT NULL,
  url                  TEXT NOT NULL DEFAULT '',   -- ntfy or Gotify server, webhook address
  topic                TEXT NOT NULL DEFAULT '',   -- ntfy only
  events               TEXT NOT NULL,              -- JSON array of event names
  include_titles       INTEGER NOT NULL DEFAULT 0,
  lang                 TEXT NOT NULL DEFAULT 'en', -- language of the messages
  origin               TEXT NOT NULL DEFAULT '',   -- the app's address, for links
  enabled              INTEGER NOT NULL DEFAULT 1,
  disabled_reason      TEXT,                       -- e.g. 'too_many_failures'
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_ok_at           INTEGER,
  last_error           TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_channels_user ON notification_channels(user_id);

-- The durable queue and the delivery log in one table.
-- status: pending (never attempted), retry, delivered, failed, skipped (rate limit).
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id               TEXT PRIMARY KEY,
  channel_id       TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  event            TEXT NOT NULL,
  dedupe_key       TEXT NOT NULL,                  -- one message per channel and firing
  message          TEXT NOT NULL,                  -- JSON of the rendered message
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  INTEGER,
  last_status_code INTEGER,
  last_error       TEXT,
  created_at       INTEGER NOT NULL,
  delivered_at     INTEGER,
  UNIQUE (channel_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_due ON notification_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_user ON notification_deliveries(user_id, created_at);
