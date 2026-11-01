-- routines-ai-step: proposals, the per-routine daily AI budget and the AI
-- usage of routines. Server state, never synced or exported. The columns this
-- change adds to rule_state, rule_runs, rule_step_runs, relay_devices and
-- assistant_consent are a Go step (store.migrateRoutinesAI), because ALTER
-- TABLE ADD COLUMN cannot be repeated (see 0037).

-- A run's planned changes waiting for the person (design D2). body holds the
-- change set as JSON for a plaintext account (content: titles the AI wrote)
-- and one ciphertext envelope for an encrypted account; it is set to NULL
-- when the proposal is applied, dismissed or expires, and never copied into
-- the run log or exports.
CREATE TABLE IF NOT EXISTS routine_proposals (
  id          TEXT PRIMARY KEY,
  rule_id     TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'waiting', -- waiting | applied | partly_applied | dismissed | expired
  items       INTEGER NOT NULL DEFAULT 0,
  applied     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  handled_at  INTEGER,
  encrypted   INTEGER NOT NULL DEFAULT 0,
  body        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS routine_proposals_run ON routine_proposals (run_id);
CREATE INDEX IF NOT EXISTS routine_proposals_user ON routine_proposals (user_id, state);

-- A routine's AI tokens per UTC day (design D11): counts only.
CREATE TABLE IF NOT EXISTS rule_ai_usage (
  rule_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,
  tokens  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rule_id, day)
);

-- The part of assistant_usage that routines' AI steps used, per UTC month
-- (in-app-assistant "Assistant consent covers routines": usage tagged routine).
CREATE TABLE IF NOT EXISTS assistant_usage_routines (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  calls         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
