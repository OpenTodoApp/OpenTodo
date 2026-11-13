-- CalDAV app passwords that show tasks as events (OpenSpec change
-- caldav-events, D1): one row per such password, written when it is created,
-- removed with it. No row is the default, to-dos. A binary from before this
-- change ignores the table and serves to-dos, which narrows nothing.
-- Idempotent.

CREATE TABLE IF NOT EXISTS app_password_events (
  app_password_id TEXT PRIMARY KEY REFERENCES app_passwords(id) ON DELETE CASCADE
);
