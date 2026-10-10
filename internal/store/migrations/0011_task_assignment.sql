-- Task assignment (OpenSpec change `task-assignment`): in-app notifications
-- produced by the notify sink after an assignment is committed. Server-side
-- account data like sessions: never written to the op log, never synced as ops.
-- task.assignee_id itself needs no schema change (it is an ordinary op field).
--
-- Idempotent so the migration is safe to re-run when numbers are reassigned at
-- merge time.
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- assigned
  payload    TEXT NOT NULL,           -- JSON, shape depends on kind
  created_at INTEGER NOT NULL,        -- Unix ms
  read_at    INTEGER                  -- Unix ms, NULL while unread
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id, created_at);
