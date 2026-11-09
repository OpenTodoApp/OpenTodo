-- The part of the account a calendar sync connection or a CalDAV app password
-- covers (OpenSpec change sync-scope, internal/syncscope): a JSON object
-- {"mode":"only"|"except","workspaces":[...],"projects":[...],"inboxes":[...]}.
-- Side tables keyed by the connection or the password, so a row without one
-- covers the whole account as before and an older binary reads every row as
-- it always did. Server configuration, never an op.
CREATE TABLE IF NOT EXISTS calsync_scopes (
  connection_id TEXT PRIMARY KEY REFERENCES calsync_connections(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_password_scopes (
  app_password_id TEXT PRIMARY KEY REFERENCES app_passwords(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL
);
