# Design

## Context

Security-relevant actions happen in `internal/auth` (sign-in, sessions, tokens) and `internal/httpapi` handlers (export, settings), with more arriving from `invitations`, `passkeys`, `oidc-login` and `mfa-totp`. Request logging goes to stdout through `slog` and is not a record the owner can query. The data directory is the trust boundary and the backup unit, so the audit record belongs in the SQLite file. Task content must stay out of the log: the future `e2ee` change encrypts task content, and a log that quoted titles would defeat it.

## Goals / Non-Goals

**Goals:**
- One recorder with a fixed event catalogue and an allow-listed detail payload.
- Atomic with the state change it describes where there is one.
- Owner-readable, filterable, exportable; members see their own access events.
- Privacy by default: no addresses unless enabled, bounded retention, no task content ever.

**Non-Goals:**
- Tamper evidence (hash chains, signatures), shipping to external collectors, alerting, task-level activity history.

## Decisions

### D1. Event catalogue as code
`internal/audit` defines `Event{Name, Outcome, ActorID, TargetID, Details}` and a closed list of names: `login.succeeded`, `login.failed`, `logout`, `mfa.enrolled`, `mfa.disabled`, `mfa.reset`, `mfa.challenge_failed`, `passkey.registered`, `passkey.deleted`, `token.created`, `token.revoked`, `invitation.created`, `invitation.accepted`, `invitation.revoked`, `role.changed`, `settings.changed`, `identity.linked`, `identity.unlinked`, `export.requested`, `audit.exported`, `backup.created`, `backup.restored`. `Record` rejects unknown names and unknown detail keys at compile time through typed constructors (`audit.TokenCreated(tokenID, name)`), so a future contributor cannot accidentally log a task title. Other in-flight changes call these constructors; names not yet emitted simply never appear.

### D2. Storage
Additive migration: `audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, name TEXT, outcome TEXT, actor_id TEXT NULL, target_id TEXT NULL, ip TEXT NULL, user_agent TEXT, details TEXT)` with indexes on `(ts)`, `(actor_id, ts)`, `(target_id, ts)` and `(name, ts)`. `details` is a JSON object with allow-listed keys only. User ids are kept even after account deletion so history stays readable; the UI shows the stored email snapshot from `details.email` when the account is gone.

### D3. Atomicity and best effort
`Recorder.RecordTx(tx, ev)` is used inside the transaction of every state change (token creation, invitation acceptance, settings change, passkey registration, role change); the change and its event commit or roll back together. Pure observations (sign-in success/failure, sign-out, export requested) use `Recorder.Record(ctx, ev)` after the fact; a failure to record is logged with `slog` at error level and does not fail the user's request. This is the standard compromise: never block sign-in on a disk error, never let a credential appear without its record.

### D4. Client address policy
`audit.log_ip` in `settings` (default `false`). When on, `clientIP(r)` (already proxy-aware) is stored. Turning it off runs `UPDATE audit_events SET ip = NULL` in the same transaction as the setting change, so the owner's choice is immediate and complete. User agent is truncated to 200 characters, as sessions already do.

### D5. Retention and pruning
`audit.retention_days` in `settings` (default 90, bounds 7–3650). A goroutine prunes at startup and hourly with `DELETE FROM audit_events WHERE ts < ?` in batches of 1000 to keep the single write connection responsive. Lowering retention takes effect on the next run; the settings change is itself recorded first.

### D6. Routes and authorization
Owner-only (`requireAuth` + owner check, 403 `forbidden`): `GET /api/v1/audit` (filters `name`, `actor`, `target`, `outcome`, `from`, `to`, `cursor`, `limit<=200`; cursor is the last seen id), `GET /api/v1/audit/export` (same filters, `application/x-ndjson`, `Content-Disposition: attachment`), `GET/PUT /api/v1/settings/audit`. Every user: `GET /api/v1/me/activity` (own events from a fixed subset of names, last 90 days, 100 rows). No delete or patch routes exist; the mux returns 404 for them as for any unknown route. Sensitive settings writes are wrapped by the step-up middleware when `mfa-totp` lands.

### D7. Keeping the log out of the user export and the client
`/api/v1/export` is untouched (projects and tasks only). The web panels fetch on open, keep results in component state, and never write to IndexedDB; the service worker already excludes `/api/` from caching. Offline, the panels show a notice instead of stale events, because stale security data is worse than none.

### D8. Client
`AuditPanel` (owner): filter bar (event select, actor email picker, outcome, date range), table with "load more", export button that reuses the current filters, retention and address-logging controls. `ActivityPanel` (everyone) under Security: last events with time, agent and outcome. Keyboard: filters tabbable, rows focusable, `e` exports when the table is focused. Roughly +4 KB gzipped, no new npm dependency.

### D9. Data model impact and footprint
One new table and two settings keys; no change to `users`, `ops`, `fields`, the op schema or the sync protocol; nothing is synced. Go: no dependency; binary unchanged within noise; memory: one hourly goroutine. Disk: ~200 bytes/event.

## Risks / Trade-offs

- [Log grows on a public server under credential stuffing] → `login.failed` is recorded once per rate-limit window per address once limiting kicks in (one `rate_limited` event instead of thousands); retention prunes; export lets the owner archive.
- [Owner enables addresses and later wants them gone] → disabling scrubs in the same transaction; documented in SECURITY.md.
- [Contributor logs task content] → typed constructors with allow-listed keys; a test scans every constructor's keys against a deny-list of entity field names.
- [Recorder failure hides an attack] → failures are logged at error level to stdout and the health endpoint does not change; a future change may surface recorder errors in the owner panel.
- [Member reads others' events through the activity route] → query is bound to the session's user id for both actor and target; test covers it.

## Migration Plan

Additive migration; older binaries ignore the table. No backfill of historic events (none exist). Defaults apply without configuration.

## Open Questions

- Whether to add an optional hash chain later for tamper evidence once there is demand; the schema leaves room (`prev_hash` column could be added additively).
- Whether `token.used` should be recorded once per day per token for visibility into script activity.
