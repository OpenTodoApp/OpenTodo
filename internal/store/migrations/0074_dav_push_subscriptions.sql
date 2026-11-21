-- Push to calendar apps (OpenSpec change caldav-push, design D4): one WebDAV-Push
-- subscription of a CalDAV client, registered with an app password on a
-- calendar or the calendar home. Server configuration like app passwords:
-- never synced, never an op, not in the user's export; revoking the app
-- password removes its subscriptions, and deleting the account removes them
-- through the app password.
CREATE TABLE IF NOT EXISTS dav_push_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  app_password_id   TEXT NOT NULL REFERENCES app_passwords(id) ON DELETE CASCADE,
  collection        TEXT NOT NULL,            -- a calendar's path segment, or 'home'
  push_resource     TEXT NOT NULL,            -- the client's push service URL (https)
  p256dh            TEXT NOT NULL,            -- base64url, uncompressed P-256 point
  auth              TEXT NOT NULL,            -- base64url, 16 bytes
  expires_at        INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,
  last_notified_seq INTEGER NOT NULL DEFAULT 0, -- the op cursor the client was last told about
  last_sent_at      INTEGER NOT NULL DEFAULT 0,
  last_ok_at        INTEGER,
  failures          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS dav_push_subscriptions_resource ON dav_push_subscriptions(user_id, collection, push_resource);
CREATE INDEX IF NOT EXISTS dav_push_subscriptions_password ON dav_push_subscriptions(app_password_id);
