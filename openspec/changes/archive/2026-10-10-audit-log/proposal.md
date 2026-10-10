# Proposal

## Why

The owner of a self-hosted server is also its security team. Today they cannot answer "who signed in last night", "when was this API token created", "did anyone accept that invitation" or "who exported the data" except by reading request logs that rotate away and are not meant for people. Invitations, passkeys, single sign-on and a second factor are all being added; each one is a new way to gain or change access, and without a record the owner is flying blind. An audit log turns security-relevant events into a durable, queryable, exportable record that lives in the data directory like everything else.

## What Changes

- A new `audit-log` capability: the server records security-relevant events (sign-ins and failures, sign-outs, second-factor events, passkey registration and removal, API token creation and revocation, invitation creation, acceptance and revocation, role changes, settings changes, exports, and backup creation and restoration once `backups` exists) with time, actor, target, outcome and a small allow-listed detail payload.
- The log never contains task or project content; the detail payload is restricted to identifiers and names of credentials, never fields of synced entities.
- Client address logging is off by default; the owner may turn it on, and turning it off again scrubs stored addresses. User agents are stored truncated.
- Retention is a setting with a 90-day default; expired events are pruned automatically. There is no API to edit or delete individual events.
- The owner reads the log in Settings with filters and pagination through `GET /api/v1/audit`, exports it through `GET /api/v1/audit/export`, and manages retention and address logging through `GET/PUT /api/v1/settings/audit`. Every user sees their own recent sign-in activity through `GET /api/v1/me/activity`.

Out of scope: an activity log of task changes (that is `comments-and-activity` and `trash-and-history`, built from the op log), shipping events to external collectors or syslog (no outbound network; the export covers it), alerting or notifications, tamper-evident hash chains and signed logs, and per-event acknowledgement.

This change advances ROADMAP.md section 7, "Audit log".

No new mandatory environment variable. No change to the op-log format: audit events are server-side records, never synced to devices, and are explicitly kept out of the user data export (they have their own export).

## Capabilities

### New Capabilities
- `audit-log`: the event catalogue, content and privacy limits, owner access with filtering, personal activity view, retention and pruning, export, append-only guarantees, and the Settings surfaces.

### Modified Capabilities
- none. Existing requirements keep their behaviour; this change adds recording around them. Other in-flight security changes name the events they emit in their own tasks and this capability defines the shape.

## Impact

- Server: `audit_events` table (additive migration), an `internal/audit` recorder used by the auth service and handlers, a periodic pruner on the existing single connection, settings keys `audit.retention_days` and `audit.log_ip` in the `settings` table (shared with `oidc-login` and `mfa-totp`; created by whichever change merges first), four handler registrations.
- Web app: an Audit log panel in Settings for the owner and a Recent activity panel for every user. Audit data is never written to IndexedDB.
- Docs: `docs/api.md`, `SECURITY.md` (what is logged, what is not), `docs/self-hosting/*.md` (retention and address logging).
- Dependencies: none. Binary size unchanged within noise; memory impact negligible. Disk: roughly 200 bytes per event; a busy household produces a few MB per year.
