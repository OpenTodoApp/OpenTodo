-- automation-rules (design D5 to D9): the rule engine's server state. The rules
-- themselves are synced entities in the op log; nothing here is exported or
-- synced. Events wait in rule_events until the worker takes them; rule_runs is
-- the run log and the idempotency record; rule_state holds a rule's watermark
-- and the server's pause; rule_batches remembers the chain depth of the batches
-- the engine wrote (loop protection).
CREATE TABLE IF NOT EXISTS rule_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id     TEXT NOT NULL DEFAULT '',  -- set for time triggers, '' for task events
  task_id     TEXT NOT NULL DEFAULT '',  -- '' for a schedule occurrence
  kind        TEXT NOT NULL,             -- the trigger kind
  label_id    TEXT NOT NULL DEFAULT '',
  project_id  TEXT NOT NULL DEFAULT '',
  section_id  TEXT NOT NULL DEFAULT '',
  origin      TEXT NOT NULL DEFAULT '',  -- the batch's device
  occurrence  TEXT NOT NULL DEFAULT '',  -- the run key for time triggers
  depth       INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rule_events_user ON rule_events (user_id, id);

CREATE TABLE IF NOT EXISTS rule_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id        TEXT NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  task_id        TEXT NOT NULL DEFAULT '',
  at             INTEGER NOT NULL,
  outcome        TEXT NOT NULL,           -- pending | applied | already_matched | skipped | stopped | failed | partial
  reason         TEXT NOT NULL DEFAULT '',
  changes_json   TEXT NOT NULL DEFAULT '[]',
  depth          INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS rule_runs_key ON rule_runs (rule_id, occurrence_key);
CREATE INDEX IF NOT EXISTS rule_runs_rule_at ON rule_runs (rule_id, at);

CREATE TABLE IF NOT EXISTS rule_state (
  rule_id       TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watermark_ms  INTEGER NOT NULL DEFAULT 0,
  paused_reason TEXT NOT NULL DEFAULT '',
  refusals      TEXT NOT NULL DEFAULT '[]' -- per-minute refusals in the last hour (Unix ms)
);

-- "Pause all my rules" (PUT /api/v1/me/rules/paused): server state, not an op.
CREATE TABLE IF NOT EXISTS user_rules_paused (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  paused_at  INTEGER NOT NULL
);
