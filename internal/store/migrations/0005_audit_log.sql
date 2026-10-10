-- Owner-visible audit log of security-relevant events (OpenSpec change `audit-log`).
-- Server-side records only: never synced, never part of the user data export.
-- details is a JSON object whose keys are allow-listed by internal/audit; it never
-- carries task or project content. ip is NULL unless the owner enabled address
-- logging, and is scrubbed when it is disabled again. actor_id and target_id are
-- plain ids (no foreign keys) so history stays readable after an account is deleted.
CREATE TABLE audit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  name       TEXT NOT NULL,
  outcome    TEXT NOT NULL,
  actor_id   TEXT,
  target_id  TEXT,
  ip         TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  details    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_events_ts ON audit_events(ts);
CREATE INDEX audit_events_actor_ts ON audit_events(actor_id, ts);
CREATE INDEX audit_events_target_ts ON audit_events(target_id, ts);
CREATE INDEX audit_events_name_ts ON audit_events(name, ts);

-- Server settings shared by several changes (audit-log, oidc-login, mfa-totp);
-- created by whichever merges first. Absent keys mean "use the default":
--   audit.retention_days  integer 7..3650, default 90
--   audit.log_ip          "true" | "false", default false
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0);
