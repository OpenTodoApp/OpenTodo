# Design

## Context

Tasks and projects are materialised from per-field LWW registers; every write is an op with `(ts, device)`. Each op carries a monotonically increasing `seq` per user. REST writes already use `device: "server"`. There is no server-side settings store yet (the `backups` change introduces `settings`; whichever lands first creates it). CalDAV clients expect WebDAV semantics (PROPFIND/REPORT XML, ETags, 412 on stale writes) and iCalendar bodies; they differ widely in which optional features they use, and some write properties we do not model (VALARM, X- properties, RRULE).

## Goals / Non-Goals

**Goals:**
- Apple Reminders, Thunderbird and Nextcloud Tasks can add, edit, complete and delete tasks and lists, and see changes made elsewhere, with no manual conflict prompts.
- Every CalDAV write is an op; the op log stays the single write path.
- Round-trip fidelity for properties we do not model.
- Zero dependency growth; endpoint off until the owner enables it.

**Non-Goals:**
- Events, scheduling, free/busy, CardDAV, shared calendars, attachments, server-side recurrence expansion, acting as a CalDAV client.

## Decisions

### D1. URL layout and discovery
`/.well-known/caldav` → 301 to `/dav/`. `/dav/` is the root with `current-user-principal` → `/dav/principals/<user-id>/`; `calendar-home-set` → `/dav/calendars/<user-id>/`; calendars at `/dav/calendars/<user-id>/inbox/` and `/dav/calendars/<user-id>/<project-id>/`; resources `<task-id>.ics`. Supported methods: OPTIONS, PROPFIND (Depth 0/1), PROPPATCH, REPORT (`calendar-query` with `comp-filter` VTODO and optional `time-range`, `calendar-multiget`, `sync-collection`), GET, HEAD, PUT, DELETE, MKCALENDAR. `DAV:` header advertises `1, 3, calendar-access`. Everything is per user; another user's paths answer 404, not 403, to avoid enumeration.
- Why ids in URLs: project renames do not move resources; ids are already stable and URL-safe.

### D2. Authentication: app passwords with Basic
New `app_passwords(id, user_id, name, hash, created_at, last_used_at, revoked_at)`; secret format `otap_<32 random>`, hashed like API tokens (SHA-256 is enough for 256-bit random secrets; argon2id is reserved for human passwords). Basic realm `OpenTodo CalDAV`. The CalDAV handler never consults sessions or API tokens, so there is no CSRF surface and a leaked app password cannot call the REST API or change the account. The existing per-IP limiter (10/min) guards failures.
- Alternative: reuse API tokens in Basic. Simpler, but tokens are full-access secrets and users would paste them into phones; separate, CalDAV-only credentials follow least privilege and let `account-access` keep its token semantics untouched.

### D3. Mapping and round-trip fidelity
Mapping as in the spec. Two details:
- `ical_extra` (new nullable string op field on `task`, max 64 KB like every value) stores the unmapped lines of the VTODO (VALARM blocks, X- properties, RRULE until `recurring-tasks`, URL, GEO, …) exactly as received. Serialisation emits mapped properties from fields, then appends `ical_extra`. A PUT compares the unmapped remainder with the stored one and emits a single op only when it differs. This keeps "one field per op" and lets two clients' alarms converge by LWW on the whole remainder (acceptable: alarms are per-client data).
- `LAST-MODIFIED` and `DTSTAMP` are derived from the greatest `ts` among the task's fields; `SEQUENCE` is not stored (always 0 outbound, ignored inbound), which the three target clients tolerate.
- Priority table chosen to match how the target clients label high/medium/low (1/5/9) with 0 = none, giving a lossless round trip for the four app levels.
- `completed_at` ⇄ `STATUS:COMPLETED` + `COMPLETED:<utc>` + `PERCENT-COMPLETE:100`; inbound `STATUS:NEEDS-ACTION`/`IN-PROCESS` or absence clears `completed_at` only if it was set (no op otherwise).

### D4. ETag, CTag, sync token from the op log
- ETag of a task: hex of `max(ts)` and the device of that winning field plus the count of non-null fields, hashed; it changes exactly when a mapped field changes, from any origin.
- CTag and sync token of a calendar: the user's current max `seq` (a global per-user counter is fine; a client sees a changed CTag and runs sync-collection, which filters by calendar). Sync token format `ot-<seq>`; `sync-collection` queries ops with `seq > token` and `entity = task`, groups by task, filters by the calendar's project, and reports tombstoned or moved-away tasks as `404` members. Tokens never expire (ops are kept), so no `valid-sync-token` failures.
- PUT conflicts: `If-Match` compared to the current ETag; mismatch → 412. `If-None-Match: *` on an existing id → 412. A PUT without preconditions on an existing resource is accepted (common for some clients) and resolves per field by LWW with server time; this is the same contract as a REST PATCH.

### D5. Write path and device id
All CalDAV writes call `sync.Apply` with `device: "caldav"` and `ts: now`. Devices pull them like REST ops. Nothing is written to `fields` directly. Calendar operations map to project ops (`name`, `color`, `created_at`, `deleted_at`, plus `project_id` moves for tasks when a project calendar is deleted, mirroring the app's behaviour).

### D6. Settings toggle
`settings.caldav_enabled` (boolean JSON) managed by `PUT /api/v1/settings/caldav` (owner only) and read on every `/dav/` request from an in-memory cache invalidated on write; `OPENTODO_CALDAV=true` seeds it on first start. When disabled, the mux returns 404 before authentication.

### D7. Data model impact
- Op schema: `task.ical_extra` (nullable string) added to `internal/sync/ops.go`, `web/src/lib/types.ts` and defaults in `web/src/lib/ops.ts`. Additive; export includes it automatically.
- Tables: `app_passwords` (new), `settings` (shared, created here if absent).
- Sync protocol: unchanged.

### D8. Dependencies and footprint
No new Go module: `encoding/xml` for WebDAV bodies, an in-house iCalendar tokenizer/serialiser (folding, escaping, parameters) of roughly 400 lines covering the VTODO subset, with conformance fixtures recorded from the three target clients. `golang.org/x/net/webdav` was considered and rejected: it models filesystems, lacks CalDAV reports, and would add ~1 MB. Expected binary growth under 300 KB; memory per request bounded by the calendar's task count (a few hundred KB for thousands of tasks). Client: one settings section, under 4 KB gzipped.

## Risks / Trade-offs

- [Client sends properties in forms we did not anticipate (TZID date-times, VALUE=DATE-TIME for all-day)] → inbound date-times with a TZID are converted to floating wall-clock in that zone; fixtures from each target client guard regressions; unknown shapes land in `ical_extra` rather than failing the PUT.
- [Large completed history makes calendars heavy] → `time-range` filtering in `calendar-query` is supported so clients can page; a later option to hide tasks completed more than N days ago can be added without protocol change.
- [Two CalDAV clients edit the same task's alarms] → whole-remainder LWW on `ical_extra`; documented; alarms are per-device preferences for the target clients.
- [Basic auth over plain HTTP on a LAN] → the settings screen shows the server URL with a warning when `OPENTODO_BASE_URL` is not https; the docs recommend TLS; app passwords are revocable.
- [Enumeration of user ids in URLs] → ids are UUIDs; foreign paths return 404; authentication is required before any path is resolved.
- [`seq`-based CTag changes on unrelated calendars] → clients then run a cheap sync-collection that returns nothing; acceptable versus tracking per-project counters.
- [Hand-rolled iCalendar parser bugs] → fuzz test on the parser; malformed input yields 415, never a panic.

## Migration Plan

Additive migration (`app_passwords`, `settings` if absent, no data changes); the new op field is accepted by servers before clients start sending it, and older clients ignore unknown fields in materialised entities. Rollback: an older image returns 404 for `/dav/` and rejects `ical_extra` ops with `invalid_op`; the docs note that CalDAV clients must be disconnected before downgrading.

## Open Questions

- Whether to expose a read-only calendar of all tasks with due dates (a "Scheduled" calendar) for clients that prefer one list; cheap to add later.
- When `recurring-tasks` lands, whether RRULE moves from `ical_extra` to a modelled field (it should; the move is additive).
