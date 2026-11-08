# Design: a tamper-evident audit log

## Context

`internal/audit` stores events in `audit_events` (id `AUTOINCREMENT`, time, name, outcome, actor, target, address, user agent, allow-listed details). Events that describe a state change are written in that change's transaction (`RecordTx`); observations are written on their own (`Record`). Retention prunes old events in batches; turning address logging off erases every stored address. Each tenant has its own database, so each tenant has its own log.

## Decisions

### D1 — A plain hash chain, no key

`hash = hex(SHA-256(previous hash + "\n" + canonical form))`. The first event after the checkpoint chains from the checkpoint's hash; the genesis hash is the empty string. A keyed MAC was considered and left out: the key would live in the data directory next to the database, and whoever can write one can read the other. The chain makes edits detectable to anyone who did not rewrite every later hash, and an anchor kept outside the server (D5) covers the one who did. The docs state this limit.

### D2 — The canonical form

A JSON array `[1, id, ts, name, outcome, actor_id|null, target_id|null, user_agent, details]`, where `1` is the format version and `details` is the stored JSON text (it is written by `json.Marshal` of a string map, so its key order is fixed). The id binds an event to its position, so swapping two events breaks the chain. The client address is left out: the owner's switch erases addresses after the fact, which must not read as tampering. A known-answer test pins the format, so other tools can recompute it from an export.

### D3 — Writing the hash

The insert reads the tip (the newest event after the checkpoint, or the checkpoint), inserts the event, takes its id and stores its hash, all in one transaction. `RecordTx` already runs inside the caller's transaction; `Record` now opens one of its own, so two events cannot chain from the same tip (the database has one writer connection, and the existing rule that `Record` is never called inside an open transaction still holds).

### D4 — Pruning keeps a contiguous chain

Pruning used to delete any event older than the retention. A chain cut in the middle cannot verify, so pruning now removes events from the start of the log in id order and stops at the first event still within the retention. Each batch, in one transaction, deletes up to 1,000 events and, when it removed chained events, sets the checkpoint to the last removed event's id and hash. Event times normally grow with ids, so nothing changes in practice; after a clock step backwards an old event waits behind a newer one. `NextPrune` follows: the first event's time, not the smallest time, decides when pruning is next due.

### D5 — Verification and the anchor

`Recorder.Verify` reads the checkpoint, then the events after it in batches of 1,000 (never holding the writer connection for a whole pass), recomputes each hash and stops at the first event whose stored hash is missing (`missing_hash`) or different (`mismatch`). The result is `{ok, checked, uncovered, checkpoint, head, break}`; a broken chain is a result, not an error.

It runs on the first housekeeping pass after a tenant opens (startup) and in hourly upkeep after changes; a broken link is logged at error level and nothing stops or is repaired. The owner runs it with `GET /api/v1/audit/verify` (policy `ownerOnly("access the audit log")`, like every audit route; it reads and changes nothing, so it is not demo-denied) and `ot audit verify`.

Removing the newest events, or rewriting every hash, leaves a chain that verifies. The export therefore ends with the chain head, read after the first page so it is at or after every exported event, and each exported event carries its hash. An owner keeps a head outside the server; in a later export, the event with that id must still have that hash, unless it was pruned (`checkpoint.id` at or above it).

### D6 — Migration: the chain starts at the tail

Migration 0060 creates `audit_chain` with the checkpoint at the newest existing event and the genesis hash; the `hash` column is added by a Go step (ALTER TABLE ADD COLUMN cannot be repeated, see 0037). Older events have no hash, are counted as `uncovered` and leave with the retention. Re-running the migration keeps the checkpoint.

### D7 — The demo

A demo instance deletes a visitor's events with their sandbox, from the middle of the log. `audit.RechainTx` recomputes the hashes after the checkpoint in the same transaction; nothing else calls it. A demo log is not evidence.

## Data model

`audit_events.hash TEXT` (NULL for events from before the chain) and `audit_chain(id = 1, after_id, hash)`. Server state, never synced or exported to users; included in backups with the rest of the database. No op or synced field changes, so offline behaviour and convergence are unaffected.

## Size and cost

Standard library only. One SHA-256 and one extra `UPDATE` per recorded event; verification is linear in the kept events (90 days by default) and runs at most hourly. No binary or bundle size change worth reporting; no UI change.
