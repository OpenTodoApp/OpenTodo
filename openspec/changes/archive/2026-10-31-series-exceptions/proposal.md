# Proposal

## Why

Once future occurrences are visible (`series-occurrences`), people want to act on them the way a calendar lets them: finish Thursday's session early, skip next Monday's report because of a holiday, or move Wednesday's study session to 19:00 without touching the others (#551, from #537: "Moving Wednesday's session to 19:00 would affect only that session if I choose 'this occurrence'"). Today only the current occurrence can be detached ("This occurrence only"), and a skip always moves the whole series. Google Calendar, Outlook and every CalDAV client handle this with exceptions (EXDATE, RECURRENCE-ID); OpenTodo's CalDAV server explicitly ignores overrides of any date but the current one, so a Thunderbird user who completes next week's occurrence sees nothing happen.

This is the second of the three series changes in 0.19 "Series and time" and builds on `series-occurrences`.

## What Changes

- **An occurrence can have one record.** Acting on one occurrence, current or future, writes its *occurrence record*: the task row completion already writes (id derived from series and date, `series_id` set), now with an additive `occurrence_date` that keeps the date it stands for when the record is moved (iCalendar RECURRENCE-ID). The record can be open (moved or edited), done, or skipped.
- **Exceptions come from the records.** A date with a record is an exception of its series: no projection is drawn there and the series never stands on it; completing or skipping the series jumps over it. Nothing is stored on the series, so two devices that act on different dates offline keep both exceptions.
- **Acting on a future occurrence.** From a projection in Day, Week, Month, Plan or Upcoming: drag it to another day or time (moves this occurrence only, with Undo), or use its menu or the occurrence panel to **Complete**, **Skip** or **Move** it. Completing early counts as one of `for N times`; skipping does not.
- **The occurrence panel.** Opening a projection or a record shows the series' fields for that one date with a scope control at the top: **This occurrence** (default there) or **All occurrences**. Editing a field under This occurrence writes the record. On the series row, the control defaults to All occurrences, as edits work today, and "This occurrence only" now writes the current occurrence's record.
- **Series edits carry to untouched records.** An All-occurrences edit of the title, priority, labels, project, section, estimate, time, assignee or location also updates open records that still hold the series' previous value of that field, so renaming "Study" renames Wednesday's moved session but not one whose title was changed alone.
- **Reminders come along.** A materialised occurrence gets copies of the series' relative reminders.
- **Repair.** A device that finds a series standing on an exception date (it rolled before it saw another device's record) moves it to the next free date; every device computes the same date.
- **CalDAV.** The series is served with `EXDATE` for each exception date from the current one on, open records as their own VTODOs, and a `for N times` end as the computed `UNTIL`. A client's `EXDATE`, a cancelled override and a completed or changed override (`RECURRENCE-ID`) of any date become the matching record.
- **API and CLI.** `POST /api/v1/tasks/{id}/occurrences/{date}/complete`, `/skip` and `PATCH /api/v1/tasks/{id}/occurrences/{date}`, with the record states in the occurrences list; `ot task occurrence <id> <date> complete|skip|edit`.

## Out of scope

- "This and following" (splitting the series): `series-split`.
- Acting on future occurrences of completion-relative rules (`every 3 days after completion`): their future dates move with each completion, so their projections stay read-only.
- Restoring a skipped occurrence to "no record". Undo right after a skip turns the record back into an open occurrence on its date, which looks and behaves the same; a skipped date stays an exception.
- Missed past occurrences (before the current one) cannot be acted on, as today; the habit backfill question stays out of scope.
- Agent and MCP write tools for occurrences: `agent-tools-complete` (0.20, #565). Assistants keep completing the current occurrence.
- Calendar sync to a user's own calendar keeps writing the next occurrence only.

This advances the roadmap 0.19 item `series-exceptions` (#551, #537). Nothing is **BREAKING**: one additive field, no migration, no environment variable. Older clients store `occurrence_date` without reading it; they still complete and skip the current occurrence, and the repair (M5) fixes a series an older client rolled onto an exception date.

Fixes #551
Relates to #537

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recurring-tasks`: occurrence records and `occurrence_date`; exceptions derived from records; next occurrence skips exceptions; end conditions with open records; acting on one occurrence; the occurrence panel and scope; "This occurrence only" writes a record; series edits carry to untouched records; the API and CLI. Modifies "Opening a projected occurrence" from `series-occurrences`, which must be archived first.
- `planner-view`: projections can be moved and acted on by those who may edit the series.
- `habits`: a record's day is its occurrence date; early-done and skipped future records.
- `reminders`: a materialised occurrence copies the series' relative reminders.
- `caldav-sync`: EXDATE, overrides of any date, UNTIL for counted rules.
- `markdown-vault`: open occurrence records are ordinary lines; the series line jumps over exceptions.

## Impact

- **Op schema:** `task.occurrence_date` (`kDate`, nullable, default null) in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, `TASK_DEFAULTS` in `web/src/lib/ops.ts`, `docs/sync.md`. A date, not user text: not an E2EE content field. Validated as a date; the server refuses it on a task without `series_id`.
- **Sync:** no new entity; records already exist. The exception set is derived on every device and on the server from records by `series_id` (the client already queries a series' records). Repair writes are ordinary ops.
- **E2EE:** devices copy and encrypt content into a record (ciphertext is bound to its entity id). Server-made records (REST, CalDAV) carry no content fields on encrypted accounts, and clients display the series' title for a record without one until an unlocked device fills it in. This also fixes server completions on encrypted accounts, which today copy undecryptable ciphertext.
- **Web:** `web/src/lib/recurring.ts` (exception-aware planning: complete, skip, move, edit, detach, carry), `web/src/lib/occurrences.ts` (exceptions, records' states), the occurrence panel in the detail view, calendar drag of projections, menus on projections, `RecurrenceField.tsx`.
- **Server:** `internal/sync/recurring.go` (`RecurringCompletion` skips exceptions, records `occurrence_date`, counts open records), a Go port of the occurrence planning sharing a fixture with the client, three routes in `internal/httpapi`, `internal/caldav` and `internal/httpapi/davroutes` (EXDATE, overrides, UNTIL), `internal/vault` (rolling skips exceptions), `internal/cli`.
- **Docs:** `docs/recurrence.md`, `docs/calendar-views.md`, `docs/caldav.md` (and its verification table rows), `docs/vault.md`, `docs/api.md` (routes, route matrix, `occurrence_date`), `docs/cli.md`, `docs/e2ee.md`.
- **Size:** no dependency; an estimated 4–5 KB gzipped on the web bundle (planning, panel scope, menus), a few tens of KB on the Go binary.
