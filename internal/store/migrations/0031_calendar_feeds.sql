-- calendar-feeds (design D4): other calendars a user subscribes to, their
-- expanded occurrences, and the secret of the user's own task feed. Server data
-- only: nothing here is in the op log, the export or a backup's op history.
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  color            TEXT NOT NULL DEFAULT '',
  enabled          INTEGER NOT NULL DEFAULT 1,
  etag             TEXT NOT NULL DEFAULT '',
  last_modified    TEXT NOT NULL DEFAULT '',
  refresh_seconds  INTEGER,            -- the calendar's own hint, when it gives one
  interval_seconds INTEGER NOT NULL,   -- current interval, after backoff
  next_fetch_at    INTEGER NOT NULL,
  last_fetch_at    INTEGER,
  last_success_at  INTEGER,
  last_error       TEXT NOT NULL DEFAULT '',
  stopped_reason   TEXT,               -- 'private_target' stops polling until re-enabled
  warnings         TEXT NOT NULL DEFAULT '[]',
  event_count      INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_subscriptions_user ON calendar_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS calendar_subscriptions_due ON calendar_subscriptions(next_fetch_at);

CREATE TABLE IF NOT EXISTS calendar_events (
  subscription_id TEXT NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  instance   TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  location   TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  start_time TEXT,
  start_tz   TEXT,
  end_date   TEXT NOT NULL,
  end_time   TEXT,
  end_tz     TEXT,
  all_day    INTEGER NOT NULL DEFAULT 0,
  free       INTEGER NOT NULL DEFAULT 0,
  start_ms   INTEGER NOT NULL, -- floating and all-day times as if UTC; queries pad a day
  end_ms     INTEGER NOT NULL,
  PRIMARY KEY (subscription_id, uid, instance)
);
CREATE INDEX IF NOT EXISTS calendar_events_start ON calendar_events(subscription_id, start_ms);

CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hash         TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
