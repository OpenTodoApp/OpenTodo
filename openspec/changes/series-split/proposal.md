# Proposal

## Why

Routines change from a date on: the Spanish class moves from 18:00 to 19:00 after the autumn break, the gym days change from Monday to Tuesday next month. Today the only way to change a series is to edit all of it, which also rewrites the occurrences between now and that date, or to end the series by hand and recreate it, which breaks its history and a habit's streak. Calendar apps offer "This and following events" for exactly this (#552, from #537: "changing the time from Wednesday onward would preserve Monday and Tuesday").

This is the third of the three series changes in 0.19 "Series and time". It builds on `series-occurrences` (seeing the dates) and `series-exceptions` (the occurrence panel and records).

## What Changes

- **"This and following".** The occurrence panel's scope control (from `series-exceptions`) gains a third option between the two. On an occurrence after the current one, the first edit under it splits the series: the series ends the day before (its rule gets `until`), and a new series, the *piece*, starts on that date with the change, in one batch with one Undo. On the current occurrence it is the same as All occurrences, so the option is not offered there.
- **Pieces stay linked.** The piece carries an additive `split_from` value (`{series, date}`) and a derived id, so two devices that split the same series at the same date offline make one piece. Each piece of a lineage runs until the next piece's start, so splits at two dates on two devices also converge.
- **History carries across.** A habit's streak and month history read the whole lineage; `for N times` counts the whole lineage, so "20 times" stays 20 across a split; the panel shows "Continues from 14 October" and "Continues as … from 14 October".
- **Single occurrences survive.** Occurrences after the split date that were already moved, completed early or skipped stay as they are and remain exceptions of the piece; the change carries to open ones that still hold the old value, as All-occurrence edits do.
- **End from a date.** A projection's menu gains **Delete this and following**, which ends the series the day before (a rule edit, no piece).
- **Integrations.** `POST /api/v1/tasks/{id}/split` with `{from, changes}` and `ot task split <id> --from <date> …`. CalDAV serves the piece as its own recurring VTODO and the old series with its `UNTIL`; the vault writes the piece as its own line.

## Out of scope

- Merging pieces back into one series.
- Linking the two objects a CalDAV client makes for its own "this and future" edit: they arrive as a rule edit on the old object and a new task, which is what they are; they are not linked as a lineage.
- Splitting completion-relative series (their future dates are hypothetical), and splitting at the current occurrence (that is All occurrences).
- "All occurrences" across pieces: it edits the piece the panel shows. Earlier pieces are mostly in the past.
- MCP write tools (`agent-tools-complete`, 0.20).

This advances the roadmap 0.19 item `series-split` (#552, #537). Nothing is **BREAKING**: one additive field, no migration, no environment variable. An older client shows the piece as an ordinary recurring task and the old series with its `until`, which is correct on its own.

Fixes #552
Relates to #537

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recurring-tasks`: splitting from an occurrence, the `split_from` link and lineage bounds, ending from a date, the third scope option, the API and CLI.
- `habits`: streak and history across the pieces of a lineage.
- `caldav-sync`: a piece is served as its own recurring VTODO; the ended series keeps its `UNTIL`.

## Impact

- **Op schema:** `task.split_from` (a new whole-value kind `kSplit`: `{series: id, date: YYYY-MM-DD}` or null) in `internal/sync/ops.go`, `web/src/lib/types.ts`, `TASK_DEFAULTS` in `web/src/lib/ops.ts`, `docs/sync.md`. Not content. The server refuses it on a task without a rule, with a series outside the task's sharing scope, or as a change once set.
- **Sync:** a split is one batch: the old series' `recurrence`, the piece's fields, carried values on open records and the piece's copied reminders. Lineage bounds are derived; a repair writes the derived `until` on an earlier piece when it disagrees, a pure function of synced rows.
- **E2EE:** the device encrypts the piece's content. A piece made through the API on an encrypted account has no content fields and shows its predecessor's until an unlocked device fills it in (`series-exceptions` D12 applies).
- **Web:** `web/src/lib/recurring.ts` (`planSplit`, `lineageOf`, lineage bounds, lineage count), `web/src/lib/occurrences.ts` (piece bounds), `web/src/lib/habits.ts` (lineage history), the scope control, the projection menu.
- **Server:** the Go port of the planning and lineage bounds (`internal/sync/occurrences.go`), one route, CalDAV serving, the vault, the CLI.
- **Docs:** `docs/recurrence.md`, `docs/calendar-views.md`, `docs/caldav.md`, `docs/vault.md`, `docs/api.md` (route, route matrix, `split_from`), `docs/cli.md`.
- **Size:** no dependency; about 2 KB gzipped on the web bundle.
