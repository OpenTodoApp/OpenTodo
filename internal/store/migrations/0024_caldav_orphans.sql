-- CalDAV resource names of purged tasks (OpenSpec change `harden-server-edges`).
-- Purges now delete a task's caldav_resources row in the same transaction; this
-- removes the rows earlier purges left behind. Idempotent: a second run finds
-- nothing to delete.
DELETE FROM caldav_resources
WHERE NOT EXISTS (SELECT 1 FROM scope_fields WHERE entity = 'task' AND entity_id = caldav_resources.task_id);
