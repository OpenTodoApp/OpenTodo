-- Project invite links (OpenSpec change `project-invite-links`): single-use,
-- expiring links that add the person who opens them to one project with a role,
-- creating their account when the link may do so. Status is derived from the
-- timestamps like invitations: revoked_at → revoked, accepted_at → accepted,
-- expires_at in the past → expired, otherwise pending. Only a hash of the secret
-- is stored. project_id names an op-log entity, so it has no foreign key.
--
-- Server-side account data: never synced, never written to the op log.
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS project_invites (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  project_id  TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('viewer','editor','admin')),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at  INTEGER
);
CREATE INDEX IF NOT EXISTS project_invites_project ON project_invites(project_id);
CREATE INDEX IF NOT EXISTS project_invites_created_by ON project_invites(created_by);
