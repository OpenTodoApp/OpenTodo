-- member-add-consent (security finding L6): adding by email someone the
-- adder shares nothing with becomes an invitation the person accepts or
-- declines. kind names what target_id is: a project (an op-log entity, so no
-- foreign key, as project_invites) or a workspace. invitee_id is null for an
-- address without an account: a placeholder that is listed like the others
-- and never notifies anyone, so the pending list does not tell which
-- addresses have accounts. A row is open while declined_at is null and
-- expires_at is in the future; accepting and cancelling delete it, a declined
-- row stays until it expires so the person is not asked again meanwhile.
--
-- Server-side account data: never synced, never written to the op log.
CREATE TABLE IF NOT EXISTS member_invitations (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('project','workspace')),
  target_id   TEXT NOT NULL,
  inviter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  declined_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS member_invitations_target_email ON member_invitations(kind, target_id, email);
CREATE INDEX IF NOT EXISTS member_invitations_invitee ON member_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS member_invitations_inviter ON member_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS member_invitations_expires ON member_invitations(expires_at);
