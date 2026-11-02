-- routines-engine (design D10): run records per routine and per step. Server
-- state, never synced or exported, and never content: ids, counts, status and
-- error codes only. Devices render titles from their own data.
--
-- The columns a routine run adds to rule_runs are a Go step
-- (store.migrateRoutineRuns), because ALTER TABLE ADD COLUMN cannot be
-- repeated (see 0037).

-- One row per step of a routine run; it goes with its run.
CREATE TABLE IF NOT EXISTS rule_step_runs (
  run_id      TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  step_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL,             -- ok | skipped | ended | failed | unavailable | truncated
  duration_ms INTEGER NOT NULL DEFAULT 0,
  items       INTEGER NOT NULL DEFAULT 0,
  out_type    TEXT NOT NULL DEFAULT '',
  ids_json    TEXT NOT NULL DEFAULT '[]', -- at most 50 entity ids read or written
  error       TEXT NOT NULL DEFAULT '',   -- an error code, never text
  PRIMARY KEY (run_id, idx)
);

-- Email steps' daily counts: 10 per routine and 20 per account per UTC day.
CREATE TABLE IF NOT EXISTS routine_emails (
  rule_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  sent    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rule_id, day)
);
