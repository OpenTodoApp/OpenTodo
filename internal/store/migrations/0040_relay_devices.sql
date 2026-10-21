-- mcp-device-relay (design D3, security review R2): devices of an end-to-end
-- encrypted account that opted in to answer AI connectors. Server state about
-- this server and this device, never synced and never in the export. A row is
-- bound to the session that opted in: only that session opens the relay stream.
CREATE TABLE IF NOT EXISTS relay_devices (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id      TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  session_hash   TEXT NOT NULL,
  enabled_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS relay_devices_session ON relay_devices(session_hash);
