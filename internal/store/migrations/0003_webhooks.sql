-- Outbound webhooks (OpenSpec change `webhooks`). Server-side configuration and
-- delivery history: never written to the op log, never synced, not exported.

-- Owner-level key/value settings shared with other changes (backups, caldav,
-- oidc-login, ...). Created only if another migration has not created it already.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER
);

-- One row per user-configured endpoint. The secret is stored in plaintext because
-- signing needs it; the database is the trust boundary (see docs/webhooks.md).
CREATE TABLE webhooks (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  secret               TEXT NOT NULL,
  events               TEXT NOT NULL,              -- JSON array of event names
  project_id           TEXT,                       -- optional project filter
  enabled              INTEGER NOT NULL DEFAULT 1,
  disabled_reason      TEXT,                       -- e.g. 'too_many_failures'
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX webhooks_user ON webhooks(user_id);

-- The durable queue and the delivery log in one table.
-- status: pending (never attempted), retry (failed, will retry), delivered, failed.
CREATE TABLE webhook_deliveries (
  id               TEXT PRIMARY KEY,
  webhook_id       TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event            TEXT NOT NULL,
  payload          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  INTEGER,
  last_status_code INTEGER,
  last_error       TEXT,
  response_excerpt TEXT,
  duration_ms      INTEGER,
  created_at       INTEGER NOT NULL,
  delivered_at     INTEGER
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at);
CREATE INDEX webhook_deliveries_log ON webhook_deliveries(webhook_id, created_at);
