-- Server query costs (OpenSpec change `server-query-costs`): the dependency
-- graph of a scope (every task's blocked_by list) is read when a batch saves a
-- dependency and after a batch completes a task. Without an index that read
-- scans every task field of the scope; this partial index holds one entry per
-- task that has a blocked_by value. Idempotent, safe to re-run after renumbering.
CREATE INDEX IF NOT EXISTS scope_fields_blocked_by ON scope_fields(scope_id, entity, field, entity_id) WHERE entity = 'task' AND field = 'blocked_by';
