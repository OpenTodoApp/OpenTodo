-- outlook-calendar-sync (design D6): a Microsoft connection reads each calendar
-- with Microsoft Graph's calendarView delta query, which is bound to a window
-- of dates. The cursor of one calendar of a connection is its delta link with
-- the window it covers; version changes whenever the calendar did, so a cycle
-- can tell an unchanged calendar from a changed one. CalDAV and Google keep
-- using calsync_connections.sync_token and ctag.
--
-- Server-side state: never synced, never written to the op log or the export.
CREATE TABLE IF NOT EXISTS calsync_cursors (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  calendar_id   TEXT NOT NULL,
  delta_link    TEXT NOT NULL,
  window_from   INTEGER NOT NULL,
  window_to     INTEGER NOT NULL,
  version       TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (connection_id, calendar_id)
);
