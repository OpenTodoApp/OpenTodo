# Proposal

## Why

Floating dates are right for "pay rent on the 1st" and "call mum Sunday": the same calendar day wherever you are. They are wrong for "stand-up at 09:00 Berlin" or "flight departs 14:35": those are instants, and a traveller or a remote team member viewing them from another zone sees the wrong time. OpenTodo currently has only floating `due` values, so anyone who crosses time zones or shares tasks across them gets silently wrong times. The roadmap asks for absolute, time-zone-aware timestamps next to the floating ones, without breaking the shape every client already syncs.

## What Changes

- The `due` value gains an optional `tz` key: `{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}`. A due with `tz` is zoned: it denotes the instant at that wall-clock time in that zone. Without `tz` it stays floating, exactly as today. `tz` requires `time`.
- Per-task choice in the detail panel: "Fixed to a time zone" toggle, defaulting to floating; switching converts the value so what the user sees does not jump.
- Zoned dues are displayed in the viewer's zone; when the viewer's zone differs from the task's, the original zone and time are shown as a hint. Today, Upcoming, sorting and the calendar grid use the converted local date and time.
- Daylight-saving rules: a zoned due is stored as wall time plus zone, not as an epoch value, so it follows the zone's rules; a non-existent wall time resolves forward, an ambiguous one resolves to the earlier offset.
- Server validation accepts `tz` only as a known IANA zone name with a `time`; the sync and REST formats are otherwise unchanged. Export carries `tz`.
- Relative reminders and recurrence compose: a reminder fires relative to the zoned instant; a recurring zoned task keeps its `tz` as it rolls.

Out of scope: a user-level default zone or "always zoned" preference (no preference entity exists yet), displaying tasks in a zone other than the viewer's, zoned `created_at`/`completed_at` (already instants), time-zone input in quick add (`nlp-quick-add`), and ICS/CalDAV mapping of `TZID` (`caldav`).

This change advances ROADMAP.md section 4, "Absolute (time-zone aware) timestamps next to floating dates" (`absolute-datetimes`).

Not **BREAKING**: the `due` field keeps its name and its existing shape; `tz` is an additive optional key inside the value. Older servers already pass unknown keys through, and older clients ignore `tz` and show the wall time (see design D5). No new environment variable.

## Capabilities

### New Capabilities
- none.

### Modified Capabilities
- `task-management`: "Floating due dates" is extended to define the two kinds of due value; new requirements cover zoned due times, display in the viewer's zone, daylight-saving behaviour, conversion between floating and zoned, and the sync and validation format.

## Impact

- Op schema: the `due` validation in `internal/sync/ops.go` accepts the optional `tz`; `Due` type in `web/src/lib/types.ts` gains `tz?: string`. No field added or renamed.
- Server binary embeds time-zone data so validation does not depend on the host (design D4): about 450 KB more binary, no runtime memory impact beyond loaded zones.
- Client: `dates.ts` gains conversion helpers (`Intl`-based, no library); `compareDue`, `describeDue`, Today/Upcoming grouping, the detail panel and the task row use them.
- Docs: `docs/sync.md` schema table, `docs/api.md`, a short "floating vs zoned" section in the README.
- Dependencies: none new on the client; the server uses the standard library's embedded zone database.
