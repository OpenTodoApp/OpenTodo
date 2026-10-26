-- calendar-two-way (design D2, D6, D10, D13): a user's connections to their own
-- calendar accounts (CalDAV or Google), the events each one wrote for a task,
-- pending Google sign-ins, and which calendar subscriptions hold a
-- connected calendar's events. Server data only: nothing here is in the op log or the
-- export; passwords and refresh tokens live in <data>/secrets/calendar-sync.json.
CREATE TABLE IF NOT EXISTS calsync_connections (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,              -- caldav | google
  name              TEXT NOT NULL DEFAULT '',
  server_url        TEXT NOT NULL,              -- what discovery started from
  username          TEXT NOT NULL DEFAULT '',   -- CalDAV only
  principal_url     TEXT NOT NULL DEFAULT '',
  home_url          TEXT NOT NULL DEFAULT '',
  calendars         TEXT NOT NULL DEFAULT '[]', -- JSON: the discovered calendars
  target_url        TEXT NOT NULL DEFAULT '',   -- '' until the user chooses
  read_urls         TEXT NOT NULL DEFAULT '[]', -- JSON: calendars shown in Day and Week
  include_date_only INTEGER NOT NULL DEFAULT 0,
  sync_token        TEXT NOT NULL DEFAULT '',   -- the target's, for sync-collection
  ctag              TEXT NOT NULL DEFAULT '',   -- the target's CTag or sync token seen last
  enabled           INTEGER NOT NULL DEFAULT 1,
  next_sync_at      INTEGER NOT NULL,
  backoff_seconds   INTEGER NOT NULL DEFAULT 0, -- the current wait after failures, 0 when healthy
  last_sync_at      INTEGER,
  last_success_at   INTEGER,
  last_error        TEXT NOT NULL DEFAULT '',
  last_error_at     INTEGER,
  stopped_reason    TEXT,                       -- stops syncing until the user acts
  last_run          TEXT NOT NULL DEFAULT '{}', -- counts of the last cycle
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calsync_connections_user ON calsync_connections(user_id);
CREATE INDEX IF NOT EXISTS calsync_connections_due ON calsync_connections(next_sync_at);

CREATE TABLE IF NOT EXISTS calsync_links (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,
  href          TEXT NOT NULL,             -- the event's address on the calendar server
  etag          TEXT NOT NULL DEFAULT '',
  snapshot      TEXT NOT NULL DEFAULT '{}', -- what was written, in task terms
  synced_at     INTEGER NOT NULL,
  PRIMARY KEY (connection_id, task_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS calsync_links_href ON calsync_links(connection_id, href);

CREATE TABLE IF NOT EXISTS calsync_oauth (
  state_hash    TEXT PRIMARY KEY,           -- SHA-256 of the state sent to Google
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verifier      TEXT NOT NULL,              -- the PKCE code verifier
  connection_id TEXT NOT NULL DEFAULT '',   -- set when reconnecting
  redirect_uri  TEXT NOT NULL,
  expires_at    INTEGER NOT NULL
);

-- A connected calendar's events are stored as a calendar subscription that this
-- table marks as managed (design D10): calendar feeds never list, count or fetch
-- it. A side table rather than a column on calendar_subscriptions, because SQLite
-- cannot run ALTER TABLE ADD COLUMN idempotently.
CREATE TABLE IF NOT EXISTS calsync_calendars (
  subscription_id TEXT PRIMARY KEY REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  connection_id   TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  calendar_url    TEXT NOT NULL,
  UNIQUE (connection_id, calendar_url)
);
