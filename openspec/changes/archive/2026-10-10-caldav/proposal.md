# Proposal

## Why

Many people already live in a calendar client: Apple Reminders on phones and watches, Thunderbird on the desktop, Nextcloud Tasks on a home server. Those clients speak CalDAV and treat tasks as VTODO resources. Without it, OpenTodo competes with every platform's built-in reminders app instead of feeding it, and users must choose between native notifications on their phone and owning their data. A CalDAV endpoint turns every such client into another synced device, with the op log still the single source of truth and the usual convergence rules.

## What Changes

- A CalDAV endpoint under `/dav/` (plus `/.well-known/caldav`) that exposes each user's projects as calendar collections of VTODO resources, with the Inbox as its own calendar, supporting discovery, listing, incremental sync, reading, writing, deleting, creating calendars and renaming them.
- Two-way mapping between VTODO properties and task fields: summary, description, due (date, floating date-time or zoned date-time with TZID), priority, status and completion time, categories as labels, parent relation as `parent_id`, RRULE as the recurrence rule where the grammar expresses it, UID as task id; unmapped properties such as alarms are preserved per task so clients do not lose them on round trips.
- Per-user app passwords, created in Settings, shown once, revocable, used with HTTP Basic authentication only on the CalDAV endpoint; account passwords and API tokens are refused there.
- Writes from CalDAV clients become ordinary operations with server time and a device id `caldav:<app-password-id>`; only changed properties produce operations, so concurrent edits from a CalDAV client and a device converge field by field. ETags, CTags and sync tokens are derived from the op log, and stale writes are refused so the client refetches.
- Off by default: the owner enables CalDAV in Settings (or an optional environment variable); until then `/dav/` does not exist. Rate limiting of failed Basic authentication reuses the existing limiter.
- Documentation of client setup for Apple Reminders, Thunderbird and Nextcloud, and of the property mapping.

Out of scope: VEVENT (events, time blocking), scheduling (iTIP/iMIP), sharing calendars through CalDAV (shared projects simply appear for their members, per `project-sharing` roles), CardDAV, RRULEs the recurrence grammar cannot express (preserved as unmapped properties), alarms as reminders (`reminders`), a CalDAV *client* that pulls from other servers.

Advances ROADMAP.md section 6, "CalDAV two-way sync (Apple Reminders, Thunderbird, Nextcloud)" (`caldav`).

No breaking changes: no new mandatory environment variable (optional `OPENTODO_CALDAV=true` presets the owner toggle), one additive task field `ical_extra` in the op schema, no renamed or removed fields.

## Capabilities

### New Capabilities
- `caldav-sync`: enabling the endpoint, app passwords, discovery and collections, property mapping, write-through and conflict handling, ETag/CTag/sync-token semantics, deletions and calendar management.

### Modified Capabilities
- `task-management`: the "Task fields" requirement gains the additive `ical_extra` field (opaque text, stored and synced, no UI), so unmapped iCalendar properties survive round trips through any device.

## Impact

- Server: new `internal/caldav` package (WebDAV XML, iCalendar parse/serialise, handlers, ETag derivation), app passwords in `internal/auth` (new `app_passwords` table), owner toggle in the shared `settings` table (introduced by `backups`; this change creates it if it arrives first), one new op field. No new Go dependency: XML and the small VTODO subset are implemented with the standard library.
- Client: Settings → CalDAV section (owner toggle, per-user app passwords with setup instructions and the server URL); `ical_extra` added to types and defaults.
- Docs: `docs/caldav.md` (client setup, mapping table, limits), `docs/api.md`, `docs/sync.md` (device ids `caldav:<id>`).
