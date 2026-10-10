-- Comments and activity (OpenSpec change `comments-and-activity`). Comments are
-- ordinary op-log entities (entity 'comment' in ops/op_scopes/scope_fields), so
-- no table is added. This index finds the comments (and reminders) of a task by
-- the task_id reference in the materialized fields: the comment thread, purge
-- cascades, first-share relabelling and the activity log all look them up.
-- It is partial so long values (bodies, descriptions) are never indexed.
--
-- Idempotent so the migration is safe to re-run when numbers are reassigned at
-- merge time.
CREATE INDEX IF NOT EXISTS scope_fields_task_ref ON scope_fields(entity, value) WHERE field = 'task_id';
