-- Project sharing (OpenSpec change `project-sharing`): every op and every
-- materialized field belongs to a scope, `user:<userId>` for personal data or
-- `project:<projectId>` for a shared project. ops.user_id keeps its meaning of
-- "author"; the scope lives next to it.
--
-- Every statement is idempotent so the migration is safe to re-run when migration
-- numbers are reassigned at merge time. SQLite has no ADD COLUMN IF NOT EXISTS, so
-- instead of altering the existing tables:
--   * the scope of an op is a side table keyed by the op's seq (op_scopes);
--   * the materialized values move to scope_fields, keyed by scope. The old
--     `fields` table is re-created empty if a previous run already dropped it, so
--     the copy below is a no-op on a re-run and never overwrites a relabelled row.
-- No op is rewritten: seq, op_id and content stay as they are.

CREATE TABLE IF NOT EXISTS op_scopes (
  seq      INTEGER PRIMARY KEY,   -- ops.seq
  scope_id TEXT NOT NULL
);
INSERT OR IGNORE INTO op_scopes(seq, scope_id) SELECT seq, 'user:' || user_id FROM ops;
CREATE INDEX IF NOT EXISTS op_scopes_scope_seq ON op_scopes(scope_id, seq);
-- Finding the ops of one entity (first-share relabel, restoring refused fields).
CREATE INDEX IF NOT EXISTS ops_entity ON ops(entity_id, entity, field);

CREATE TABLE IF NOT EXISTS fields (
  user_id   TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  value     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  device    TEXT NOT NULL,
  PRIMARY KEY (user_id, entity, entity_id, field)
);
-- Current winning value per field inside a scope (last-writer-wins by (ts, device)).
CREATE TABLE IF NOT EXISTS scope_fields (
  scope_id  TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  value     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  device    TEXT NOT NULL,
  PRIMARY KEY (scope_id, entity, entity_id, field)
);
INSERT OR IGNORE INTO scope_fields(scope_id, entity, entity_id, field, value, ts, device)
  SELECT 'user:' || user_id, entity, entity_id, field, value, ts, device FROM fields;
DROP TABLE fields;
CREATE INDEX IF NOT EXISTS scope_fields_entity ON scope_fields(entity, entity_id);

-- A shared project. Created on first share; never removed (a scope whose only
-- member is the owner behaves like personal data).
CREATE TABLE IF NOT EXISTS project_scopes (
  project_id TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Authorization data, like sessions and tokens: changed only through the
-- membership routes, never through the op log. The owner has a row with role
-- 'owner'. backfill is 1 for members who joined after the project's history began
-- and therefore need it replayed behind their devices' cursors.
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,          -- owner | admin | editor | viewer
  added_by   TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  backfill   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user ON project_members(user_id);

-- History replay progress per member device: ops of the project's scope with
-- done_seq < seq <= upto_seq are served before the device's regular pull. upto_seq
-- is the device's cursor when it first synced after joining.
CREATE TABLE IF NOT EXISTS member_backfills (
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  device     TEXT NOT NULL,
  upto_seq   INTEGER NOT NULL,
  done_seq   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, user_id, device)
);
