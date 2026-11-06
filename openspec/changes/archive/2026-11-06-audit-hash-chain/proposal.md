# A tamper-evident audit log

## Why

The threat model (`docs/security/threat-model.md`, accepted risks; hardening item 6.13 of `external-security-review`) says the audit log is not tamper-evident: someone with write access to the database file can edit or remove an event and nothing notices. The log is the evidence after an incident, so an edit should at least be detectable. The owner decided on 2026-11-06 to do this before the 1.0 release candidate, and to leave the other three parts of 6.13 (host-mode CPU and memory isolation, E2EE rollback protection, signed web app code) until after 1.0 (#968, #969, #970).

## What Changes

- Every audit event stores a hash: SHA-256 of the previous event's hash, a newline and a canonical form of the event (format version, id, time, name, outcome, actor, target, user agent, stored details). The client address is left out, because turning address logging off erases it.
- A one-row checkpoint (`audit_chain`) records where the chain starts: the last event not covered and the hash after it. Pruning removes events from the start of the log in id order and moves the checkpoint to the last event removed, in the same transaction, so the events kept still verify.
- Verification recomputes the chain and reports the first broken link (`missing_hash` or `mismatch`) without failing: at startup and hourly after changes (logged at error level), through the new owner route `GET /api/v1/audit/verify`, and through `ot audit verify` (exit 1 with `audit_chain_broken`).
- Each event carries its `hash` in the list, export and activity shapes, and the NDJSON export ends with the chain head `{"chain": {"id", "hash"}}`, which the owner keeps outside the server as an anchor. The docs explain how to compare a later export with it.
- Migration 0060 starts the chain at the current tail: events already in the log keep no hash and are not covered.
- The public demo, which removes a visitor's events with their sandbox, rebuilds the chain over the rest.

Not **BREAKING**: no op, no synced data, no environment variable. Additive API fields (`hash`), one new route and one new last line in the export.

Out of scope: a keyed (HMAC) or externally anchored chain; an attacker who can write the database can recompute every hash, and the docs say so. Host-mode isolation, E2EE rollback protection and signed web app code (after 1.0).

ROADMAP: hardening of the shipped `audit-log` feature; completes the pre-1.0 part of `external-security-review` task 6.13.

## Capabilities

### Modified Capabilities

- `audit-log`: "Retention and pruning" prunes in id order and keeps the chain verifiable; "Export of the log" adds the chain head line and each event's hash; "Append-only record" gains the hash chain; a new requirement "Hash chain verification".

## Impact

- `internal/audit` (`chain.go`, `recorder.go`, `prune.go`, `next.go`, `query.go`), `internal/store` (migration `0060_audit_chain.sql`, the Go step for the `hash` column), `internal/httpapi/audit.go` and `router.go`, `internal/tenant/jobs.go`, `internal/demo/sandbox.go`, `internal/cli/cmd_audit.go`.
- Docs: `docs/api.md`, `docs/cli.md`, `docs/self-hosting/docker.md`, `docs/security/threat-model.md`, `how-we-verify.md`, `limits.md`; CHANGELOG `### Security`.
- Size: standard library only (`crypto/sha256`); one hash and one extra update per recorded event.
