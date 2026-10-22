-- workspaces (design D3, D4, D11): the server-side directory of workspaces,
-- their members and groups, and the grants that make up a shared project's
-- effective membership. Nothing here is an op or a sync scope: project_members
-- stays the materialised effective membership every reader uses, and gains
-- `via` (comma-separated group ids the role comes from, '' for direct only).
-- The default workspace of every account (kind 'default', id
-- ids.NameID("workspace", user id)) is created by store.Migrate in Go after
-- this file, because SQLite cannot derive that id.
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'created' CHECK (kind IN ('default','created')),
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS workspaces_owner ON workspaces(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_default ON workspaces(owner_id) WHERE kind = 'default';

-- Every workspace lists its owner here too (role 'owner'), so "my workspaces"
-- is one join; a default workspace never has another row.
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  added_by     TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user ON workspace_members(user_id);

-- Single-use links that add an account to a created workspace (the shape of
-- project_invites; only the SHA-256 of the secret is stored).
CREATE TABLE IF NOT EXISTS workspace_invites (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email        TEXT,
  role         TEXT NOT NULL CHECK (role IN ('member','admin')),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  accepted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS workspace_invites_workspace ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invites_created_by ON workspace_invites(created_by);

CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS groups_workspace ON groups(workspace_id);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user ON group_members(user_id);

-- What people granted on a shared project: one row per direct grant (subject
-- a user, the owner included with role 'owner') or group grant. The effective
-- membership in project_members is recomputed from these rows.
CREATE TABLE IF NOT EXISTS project_grants (
  project_id   TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('user','group')),
  subject_id   TEXT NOT NULL,
  role         TEXT NOT NULL,
  added_by     TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, subject_kind, subject_id)
);
CREATE INDEX IF NOT EXISTS project_grants_subject ON project_grants(subject_kind, subject_id);

-- Every existing member becomes a direct grant. project_members.via is added
-- by store.Migrate's Go step when missing (ALTER TABLE ADD COLUMN cannot be
-- repeated, see 0037).
INSERT OR IGNORE INTO project_grants(project_id, subject_kind, subject_id, role, added_by, created_at)
  SELECT project_id, 'user', user_id, role, added_by, created_at FROM project_members;
