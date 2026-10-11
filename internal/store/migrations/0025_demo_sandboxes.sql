-- Demo sandboxes (OpenSpec change `demo-sandboxes`, design D1, D2, D3, D7): one
-- row per visitor sandbox on a demo instance. Server bookkeeping only: never
-- synced, never exported. user_id is the visitor's password-less account and
-- collaborator_id its non-interactive demo collaborator; both are deleted with
-- the row. addr_hash is the creator's address hashed with a per-process salt
-- (never the address itself). The write budget lives here, not in memory, so it
-- holds across server processes during a rolling update.
--
-- demo_token_uses remembers spent sandbox-creation tokens until they expire, so
-- each token creates at most one sandbox even across processes.
--
-- Every statement is idempotent so the migration is safe to re-run when
-- migration numbers are reassigned at merge time.
CREATE TABLE IF NOT EXISTS demo_sandboxes (
  user_id         TEXT PRIMARY KEY,
  collaborator_id TEXT NOT NULL,
  created_at      INTEGER NOT NULL,           -- Unix ms
  last_active_at  INTEGER NOT NULL,           -- Unix ms, updated at most once a minute
  addr_hash       TEXT NOT NULL DEFAULT '',
  ops_hour_start  INTEGER NOT NULL DEFAULT 0, -- Unix ms, start of the current hour window
  ops_hour_count  INTEGER NOT NULL DEFAULT 0,
  ops_total       INTEGER NOT NULL DEFAULT 0,
  bytes_total     INTEGER NOT NULL DEFAULT 0  -- value bytes of the visitor's stored ops
);
CREATE INDEX IF NOT EXISTS demo_sandboxes_active ON demo_sandboxes(last_active_at);
CREATE INDEX IF NOT EXISTS demo_sandboxes_created ON demo_sandboxes(created_at);
CREATE INDEX IF NOT EXISTS demo_sandboxes_addr ON demo_sandboxes(addr_hash, created_at);

CREATE TABLE IF NOT EXISTS demo_token_uses (
  nonce      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL                 -- Unix ms
);
