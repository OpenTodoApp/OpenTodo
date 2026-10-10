-- Import jobs and the entities they wrote (OpenSpec change `data-import`).
-- Operational metadata only: the imported data itself lives in the op log like any
-- other write, and these tables are not part of the export. import_items remembers
-- which source rows a job created so a repeated import of the same file can skip
-- them and undo can tombstone exactly what the job created.
-- Statements are idempotent so the migration is safe to re-run.
CREATE TABLE IF NOT EXISTS import_jobs (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile      TEXT NOT NULL,
  status       TEXT NOT NULL,              -- running | done | failed | undone
  options_json TEXT NOT NULL DEFAULT '{}',
  totals_json  TEXT NOT NULL DEFAULT '{}',
  errors_json  TEXT NOT NULL DEFAULT '{}', -- {"message": "...", "rows": [{row, sourceId, reason}]}
  created_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  undone_at    INTEGER
);
CREATE INDEX IF NOT EXISTS import_jobs_user ON import_jobs(user_id, created_at);

CREATE TABLE IF NOT EXISTS import_items (
  job_id    TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL DEFAULT '',
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action    TEXT NOT NULL,                 -- created | updated
  PRIMARY KEY (job_id, entity, entity_id)
);
