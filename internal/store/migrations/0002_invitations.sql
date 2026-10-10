-- Single-use, expiring invitation links created by the owner (OpenSpec change `invitations`).
-- Status is derived from the timestamps: revoked_at → revoked, accepted_at → accepted,
-- expires_at in the past → expired, otherwise pending. Only a hash of the secret is stored.
CREATE TABLE invitations (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at  INTEGER
);
CREATE INDEX invitations_created_by ON invitations(created_by);
CREATE INDEX invitations_expires_at ON invitations(expires_at);
