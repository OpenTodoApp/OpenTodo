-- audit_chain makes the audit log tamper-evident (OpenSpec change `audit-hash-chain`).
-- Every event stores hash = SHA-256(previous hash, "\n", the event's canonical form)
-- in audit_events.hash, a column added by the Go step in audit_chain.go (ALTER TABLE
-- ADD COLUMN cannot be repeated, see 0037); see internal/audit/chain.go.
--
-- audit_chain is the chain's one checkpoint: after_id is the last event the chain does
-- not cover and hash the hash the first event after it chains from. Pruning moves the
-- checkpoint to the last event it removed, so the events kept still verify.
--
-- The chain starts at the current tail: events recorded before this migration have no
-- hash and are not covered (after_id is the newest of them, hash the empty genesis
-- value). They leave the log with the retention as before. Idempotent: a re-run keeps
-- the checkpoint.
CREATE TABLE IF NOT EXISTS audit_chain (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  after_id INTEGER NOT NULL,
  hash     TEXT NOT NULL
);
INSERT OR IGNORE INTO audit_chain(id, after_id, hash) SELECT 1, COALESCE(MAX(id), 0), '' FROM audit_events;
