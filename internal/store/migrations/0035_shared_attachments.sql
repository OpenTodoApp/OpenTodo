-- Attachments of projects shared before harden-links-and-sharing. Sharing a
-- project moved its tasks (and their comments) to the project's scope but left
-- the tasks' attachments in the owner's personal scope: members never saw them
-- and a purge of the task left them behind. This moves each such attachment,
-- its fields and its ops' scope labels, into the scope its task now lives in,
-- when its personal scope belongs to a member of that project and no longer
-- holds the task. Members that joined replay the project's history once more, so
-- their devices receive the moved attachments (ops keep their seq, which is
-- behind those devices' cursors). Idempotent: a second run finds nothing to move.
CREATE TEMP TABLE attachment_moves AS
SELECT DISTINCT a.scope_id AS from_scope, a.entity_id AS attachment_id, t.scope_id AS to_scope
FROM scope_fields a
JOIN scope_fields t ON t.entity = 'task' AND t.field = 'project_id' AND t.scope_id LIKE 'project:%'
  AND t.entity_id = json_extract(a.value, '$')
JOIN project_members m ON 'project:' || m.project_id = t.scope_id AND 'user:' || m.user_id = a.scope_id
WHERE a.entity = 'attachment' AND a.field = 'task_id' AND a.scope_id LIKE 'user:%' AND json_valid(a.value)
  AND NOT EXISTS (SELECT 1 FROM scope_fields p WHERE p.scope_id = a.scope_id AND p.entity = 'task' AND p.entity_id = t.entity_id);

UPDATE op_scopes SET scope_id = (
  SELECT mv.to_scope FROM attachment_moves mv JOIN ops o ON o.entity = 'attachment' AND o.entity_id = mv.attachment_id
  WHERE o.seq = op_scopes.seq AND mv.from_scope = op_scopes.scope_id LIMIT 1)
WHERE EXISTS (
  SELECT 1 FROM attachment_moves mv JOIN ops o ON o.entity = 'attachment' AND o.entity_id = mv.attachment_id
  WHERE o.seq = op_scopes.seq AND mv.from_scope = op_scopes.scope_id);

UPDATE OR IGNORE scope_fields SET scope_id = (
  SELECT mv.to_scope FROM attachment_moves mv
  WHERE mv.from_scope = scope_fields.scope_id AND mv.attachment_id = scope_fields.entity_id LIMIT 1)
WHERE entity = 'attachment' AND EXISTS (
  SELECT 1 FROM attachment_moves mv WHERE mv.from_scope = scope_fields.scope_id AND mv.attachment_id = scope_fields.entity_id);

DELETE FROM member_backfills WHERE 'project:' || project_id IN (SELECT to_scope FROM attachment_moves);

DROP TABLE attachment_moves;
