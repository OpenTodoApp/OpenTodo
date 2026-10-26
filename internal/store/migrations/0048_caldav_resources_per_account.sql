-- entity-id-ownership (security finding L9): the resource names and UIDs that
-- calendar clients chose were keyed by task id alone, so the client of one
-- account could rename or drop the name the client of another account had
-- given a task they both see. Rows are now per account. Each existing row is
-- kept for every account that can see the task (the owner of a personal task,
-- every member of a shared project), so every client keeps finding its
-- resources where it put them; rows of unknown tasks are dropped, as before.
CREATE TABLE IF NOT EXISTS caldav_resources_v2 (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  uid     TEXT NOT NULL,
  PRIMARY KEY (user_id, task_id)
);

INSERT OR IGNORE INTO caldav_resources_v2(user_id, task_id, name, uid)
SELECT u.id, r.task_id, r.name, r.uid
FROM caldav_resources r
JOIN (SELECT DISTINCT scope_id, entity_id FROM scope_fields WHERE entity = 'task') f ON f.entity_id = r.task_id
JOIN users u ON f.scope_id = 'user:' || u.id;

INSERT OR IGNORE INTO caldav_resources_v2(user_id, task_id, name, uid)
SELECT m.user_id, r.task_id, r.name, r.uid
FROM caldav_resources r
JOIN (SELECT DISTINCT scope_id, entity_id FROM scope_fields WHERE entity = 'task') f ON f.entity_id = r.task_id
JOIN project_members m ON f.scope_id = 'project:' || m.project_id;

DROP TABLE caldav_resources;
ALTER TABLE caldav_resources_v2 RENAME TO caldav_resources;
CREATE INDEX IF NOT EXISTS caldav_resources_name ON caldav_resources(user_id, name);
CREATE INDEX IF NOT EXISTS caldav_resources_uid ON caldav_resources(user_id, uid);
CREATE INDEX IF NOT EXISTS caldav_resources_task ON caldav_resources(task_id);
