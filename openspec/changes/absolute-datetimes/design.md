# Design

## Context

`due` is `{date: "YYYY-MM-DD", time?: "HH:MM"}` validated on the server (`kDue`) and compared lexicographically on the client. The server stores op values as raw JSON and the REST layer returns them as stored. The product promise "same date everywhere" must survive; the new need is a second kind of due that is an instant. The constraints: no field rename, no second write path, older clients and servers in the field during rollout, a distroless image with no zone database on disk.

## Goals / Non-Goals

**Goals:**
- Add zoned times without changing what any existing value means.
- One LWW register for the whole due so date, time and zone are always consistent.
- Correct display in the viewer's zone, including across midnight and DST, with no network.
- Keep the floating default; make zoned an explicit per-task choice.

**Non-Goals:**
- User-level defaults (needs a preferences entity; later change).
- Viewing in an arbitrary zone, world-clock features.
- Making `created_at`, `completed_at` or reminders' `fire_at` anything other than the Unix instants they already are.

## Decisions

### D1. `tz` lives inside the `due` value, not in a new field
Chosen: `{date, time, tz?}` with `tz` an IANA zone name, allowed only with `time`.
- Why: convergence. If the zone were a sibling field (`due_tz`), two concurrent edits could leave a floating date from device A paired with a zone from device B, or a zone pointing at a time that no longer exists. A single value is one LWW register: the winner is always a coherent triple (spec scenario "Concurrent floating and zoned edits"). It is also backwards compatible: the server's validator decodes into a struct that ignores unknown keys and stores the raw JSON, so even a pre-change server stores and serves `tz` untouched; a pre-change client reads `date` and `time` and ignores `tz`.
- Alternative: additive `due_at` epoch-millisecond field alongside `due`. Rejected: two sources of truth for "when", a mixed-edit hazard between them, and epoch storage loses the wall-time intent when a zone's rules change (D3).
- Alternative: an `absolute` boolean plus the device's zone at edit time. Rejected: the zone is the information; a boolean would make the value depend on who last edited it.

### D2. Semantics
- Floating (`tz` absent): unchanged; date and time compared as strings; "today" in the viewer's zone.
- Zoned (`tz` present): the instant `(date, time)` in `tz`. For display, convert the instant to the viewer's zone, giving a local `(date, time)` used for grouping, sorting (`compareDue` compares local triples) and the calendar grid. Hint text shows the original `time` and the zone's short name when zones differ.
- Zoned without time is invalid; clearing the time drops `tz`.

### D3. Store wall time plus zone, not an epoch
A zoned due is kept as the user wrote it. Resolving to an instant happens at render time using current zone rules. Non-existent local times resolve forward (first valid instant after the gap); ambiguous times resolve to the earlier offset. Both rules match what calendar systems do and are spelled out in the spec so Go and TypeScript agree.
- Trade-off: an epoch would make sorting a single number; but it fixes the offset at edit time and silently drifts if a government changes DST rules, and it makes "09:00 Berlin every Monday" (with `recurring-tasks`) impossible to roll correctly.

### D4. Zone validation on the server
`kDue` accepts `tz` only when `time` is present and `time.LoadLocation(tz)` succeeds; max 64 characters. The image is distroless with no `/usr/share/zoneinfo`, so the binary imports `time/tzdata` (standard library embed). Impact: about 450 KB on the binary, image still far under 50 MB, zone data is loaded lazily per zone, memory impact negligible. The server never converts for display; it only validates and, for `reminders`, computes `fire_at` on REST-originated due changes.
- Alternative: validate `tz` as a syntactic pattern only. Rejected: a typo would become a value no client can render; the embedded database is cheap.

### D5. Client conversion without a library
`Intl.DateTimeFormat` with `timeZone` and `formatToParts` gives wall-clock components for an instant in any zone; combined with a small fixed-point search (two iterations) it also gives the instant for a wall time in a zone, including the gap and overlap rules. Helpers in `dates.ts`: `dueToInstant(due)`, `instantToLocalDue(ms)`, `localDueOf(due)` (the triple used for sorting and grouping), `zoneHint(due)`. The viewer's zone is `Intl.DateTimeFormat().resolvedOptions().timeZone`, re-read on visibility change so a travelling device updates when its zone changes. No dependency; about 2 KB gzipped.

### D6. Rollout compatibility
- Old server, new client: the `kDue` struct ignores `tz`; the raw value is stored and served. Nothing breaks, nothing is lost.
- New server, old client: receives `tz`, renders the floating wall time (slightly wrong across zones, which is the status quo), and preserves `tz` because it never rewrites `due` unless the user edits the date or time, in which case the user's new floating value wins, which is the correct LWW outcome.
- Therefore no migration, no version gate. `docs/sync.md` documents `tz` as an optional key of the `due` type.

### D7. Interaction with sibling changes
- `reminders`: `fire_at` for a relative reminder is computed from `dueToInstant(due)`, so zoned dues give exact instants and floating ones use the editing device's zone as today.
- `recurring-tasks`: the calculator rolls `date` and preserves `time` and `tz` unchanged.
- `time-blocking`: the grid places blocks by the local triple from D2.

### D8. Data model impact
No new field, no rename; the `due` value shape gains one optional key. Export unchanged except for the key. REST schema docs updated.

## Risks / Trade-offs

- [Users confused by two kinds of due] → Default floating, one explicit toggle labelled with the zone name, hint text whenever a zoned task is viewed from elsewhere.
- [Browser `Intl` zone data differs from the server's] → Server validates names only; display is always the browser's view, consistent within a device; disagreements are limited to zones added or renamed recently and degrade to a wrong offset, never a rejected value.
- [Sorting mixes floating and zoned dues] → Both reduce to the viewer's local triple before comparison; the rule is deterministic per device.
- [Travelling device changes zone while open] → Zone re-resolved on visibility change; lists re-render from live queries.
- [`time/tzdata` adds to binary size] → About 450 KB, measured and reported in the changelog; image stays well under the 50 MB budget.

## Migration Plan

None required. Rollback: remove the toggle; stored `tz` keys remain valid pass-through values.

## Open Questions

- Whether the hint should show a UTC offset in addition to the zone's short name for zones without a well-known abbreviation.
- Whether to add a per-user "fix new timed tasks to my zone" default once a preferences entity exists.
