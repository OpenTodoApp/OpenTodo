-- Performance budgets (OpenSpec change `performance-10k`): listing one
-- project's items over REST (`GET /api/v1/tasks?project_id=`) finds the
-- project's entities first. Without an index that read scans every field of
-- the scope; this partial index holds one entry per item that has a
-- project_id value, with the entity id, so the lookup never reads the table.
-- Idempotent, safe to re-run after renumbering.
CREATE INDEX IF NOT EXISTS scope_fields_project ON scope_fields(scope_id, entity, value, entity_id) WHERE field = 'project_id';
