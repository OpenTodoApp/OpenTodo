-- Trash and history (OpenSpec change `trash-and-history`, design D5): purge
-- markers. Purging a trashed task or project removes its operations, their scope
-- labels and its materialized fields; one marker per purged entity remains so
-- devices drop their local copy on their next sync and late operations for the
-- entity are discarded instead of resurrecting it. Markers are kept indefinitely.
--
-- seq is reserved from the ops sequence (sqlite_sequence 'ops') so markers and
-- ops share one cursor space. scope_id is the sharing scope the entity lived in:
-- everyone who can see that scope learns about the purge. user_id is the account
-- that requested it ('' for the retention job).
--
-- Every statement is idempotent so the migration is safe to re-run when migration
-- numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS purges (
  seq       INTEGER PRIMARY KEY,
  user_id   TEXT NOT NULL,
  scope_id  TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  purged_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purges_scope_seq ON purges(scope_id, seq);
CREATE INDEX IF NOT EXISTS purges_entity ON purges(entity_id, entity);
