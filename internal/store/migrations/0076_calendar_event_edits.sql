-- Edit calendar events in the calendar (OpenSpec change calendar-event-edits,
-- design D2, D12). Side tables only, so an older binary never reads them and
-- calendar_events and calsync_connections keep their exact columns. Server
-- data: never an op, not in the export or a backup.

-- Where each cached occurrence of a connected calendar lives on the account,
-- the version last read or written and why it cannot be changed ('' when it
-- can: recurring, has_guests, not_organizer, no_etag).
CREATE TABLE IF NOT EXISTS calendar_event_remote (
  subscription_id TEXT NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  uid             TEXT NOT NULL,
  instance        TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  href            TEXT NOT NULL,
  etag            TEXT NOT NULL DEFAULT '',
  locked          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (subscription_id, uid, instance)
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_remote_id ON calendar_event_remote(subscription_id, event_id);

-- A row means "Edit events in OpenTodo" is on for the connection; assistants
-- = 1 means "Let assistants edit events" is on too.
CREATE TABLE IF NOT EXISTS calsync_event_edit (
  connection_id TEXT PRIMARY KEY REFERENCES calsync_connections(id) ON DELETE CASCADE,
  assistants    INTEGER NOT NULL DEFAULT 0
);

-- The account's own calendar addresses (lower case, without mailto:), for the
-- not_organizer lock.
CREATE TABLE IF NOT EXISTS calsync_account_addresses (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,
  PRIMARY KEY (connection_id, address)
);

-- The values an assistant's edit replaced, so the person can undo it; kept 30 days.
CREATE TABLE IF NOT EXISTS calendar_event_undo (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  summary       TEXT,
  start_json    TEXT,
  end_json      TEXT,
  all_day       INTEGER,
  etag          TEXT NOT NULL,
  token_id      TEXT NOT NULL,
  token_name    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (connection_id, event_id)
);

-- Managed calendars have no remote refs yet: read them once more.
UPDATE calendar_subscriptions SET etag = ''
  WHERE id IN (SELECT subscription_id FROM calsync_calendars);
