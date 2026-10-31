# Design

## Context

- **Records already exist.** Completing a series writes a completed copy with the id `occurrenceId(series, date)` and moves the series (`web/src/lib/recurring.ts` `planCompletion`; server `internal/sync/recurring.go` `RecurringCompletion`; vault `internal/vault/task.go`). A habit's skip writes the same record with `skipped: true` (`habits`). `completedOccurrences` recognises a record by `id === occurrenceId(series, due.date)`, so a record whose `due` moved would stop being recognised: that is why the date it stands for must be stored.
- **"This occurrence only"** (`planDetach`, `Shift+O`) writes a standalone copy with a different id (`detachedId`) and moves the series on.
- **Projections** are drawn in Day, Week, Month, Plan and (opt-in) Upcoming, read-only (`series-occurrences`, `planner-view`).
- **CalDAV** serves one VTODO per task with `RRULE` from the rule (`internal/recurrence/rrule.go`), including `COUNT=N` for `for N times` even though DTSTART is the current occurrence, not the first; inbound, only a completed override of the current date is honoured (`internal/caldav/decode.go` `completedOccurrences`).
- **E2EE**: a ciphertext is bound to its entity id and field (`docs/e2ee.md`), so a server that copies a series' encrypted title into a record produces "[Cannot decrypt]".
- **Purge**: a purged entity id can never be written again (`trash-and-history`, "Purged entities never return"). A derived id must therefore not depend on tombstones.

## Goals / Non-Goals

**Goals:** act on any future occurrence of a calendar rule, alone, offline, converging; exceptions that survive concurrent edits; CalDAV clients that see and send exceptions; no new entity.

**Non-Goals:** "this and following" (`series-split`); completion-relative rules; editing missed past occurrences; MCP write tools.

## Shared series model

The three series changes (`series-occurrences`, `series-exceptions`, `series-split`) share this model. Each design.md carries the same section so each change can be read, built and archived alone; a later change only adds the parts marked with its name. It names the model `recurring-tasks` already ships and extends it.

**M1. The series row is the task.** A recurring task is one row that holds the rule and stands on its *current occurrence*: its `due` (unchanged since `recurring-tasks`). Edits to the row are edits to the series. There is no separate "series definition" entity and no stored list of future dates.

**M2. An occurrence is a date of the series.** The *occurrence dates* of a series are the dates its rule produces from the current occurrence onward, within its end condition (`until`, `for N times`) and, after a split, within its piece (M7). An occurrence is identified by `(series id, occurrence date)`. Nothing is stored for an occurrence nobody acted on: it is drawn as a *projected occurrence*, computed on each device from the synced series row and its occurrence records, so every device draws the same ones (`series-occurrences`).

**M3. An occurrence record is the one row an occurrence can have.** When someone acts on one occurrence alone (completes it, skips it, moves it, edits it, or uses "This occurrence only"), the occurrence becomes a task row with:
- the id `occurrenceId(series id, occurrence date)`, the derivation completion records use today (`nameId("occurrence", "<series>:<date>")`), so devices acting on the same occurrence offline write the same row;
- `series_id` = the series, `recurrence` = null, the series' other fields copied as completion records copy them today;
- the additive field `occurrence_date` = the occurrence date it stands for (iCalendar `RECURRENCE-ID`), written once at creation and never changed by the app (`series-exceptions`).

A record is in one of four states: **open** (moved or edited, still to do: `completed_at` null), **done** (`completed_at` set), **skipped** (`completed_at` set and `skipped` true, as habits already write) or **trashed** (`deleted_at` set; only an older client or the Trash writes it, the app removes an occurrence by skipping it). A record written before `series-exceptions` has no `occurrence_date`; its occurrence date reads as its `due.date`, which is how `completedOccurrences` recognises it today. A "This occurrence only" copy made before `series-exceptions` (id `detachedId`) stays a standalone task and is not a record.

**M4. Exceptions are derived from the records, never stored on the series.** The *exception dates* of a series are the occurrence dates of its records, in any state. A projection is never drawn on an exception date, and the series never stands on one: moving the series to its next occurrence (completion, skip, "This occurrence only") goes to the first occurrence date after the current one that is not an exception. This is iCalendar's EXDATE, kept where it converges: two devices that each act on a different date offline each write their own record, and both exceptions survive the sync. A list field on the series (an `exdates` register) would lose one of them under last-writer-wins.

**M5. Repair when a device rolled before it saw a record.** A device that moved the series before it received another device's record can leave the series standing on an exception date. Any device that may edit the task and finds the series on an exception date writes the series' `due` (and the `deadline` and `start` that move with it) to the next non-exception occurrence date. The value is a pure function of the synced rows, so every device that repairs writes the same value and they converge; the server's completion path (REST, CalDAV, assistant) applies the same rule before it writes.

**M6. Counting.** `for N times` keeps the meaning `recurring-tasks` gave it: done records count, skipped records do not, so a skip extends the series by one. An open record is an occurrence still to come, so it uses up one of the remaining N while it is open. The series' remaining budget is `N − done records − open records`; the current occurrence and the projections together never exceed it. `until` bounds every date, records included.

**M7. A split makes pieces of one lineage (`series-split`).** "This and following" from an occurrence after the current one ends the series the day before (`until`) and starts a new series row, the *piece*, on that date, with the id `nameId("series-split", "<series>:<date>")` and the additive field `split_from` = `{series, date}`. The pieces of one lineage are the root series and every piece whose `split_from` leads back to it. Each piece produces occurrence dates from its own `split_from.date` until the day before the next piece's `split_from.date` (pieces ordered by that date), whatever its own `until` says; records of earlier pieces dated on or after a piece's first date are exceptions of that piece too. Habit history and the `for N times` count are taken over the lineage.

**M8. Who sees what.** Projections are read from local rows and work offline. A viewer of a shared project sees projections and records but cannot act on them. On an encrypted account the device copies and encrypts content into a record itself (a ciphertext is bound to its entity id, so it cannot be copied as is); the server, which cannot read the series' title, writes the records it creates without content fields, and every client shows a record's missing title and notes from its series until an unlocked device fills them in.

**M9. Outside the app.** CalDAV serves the series as one VTODO (DTSTART/DUE = current occurrence, RRULE), every exception date from the current occurrence on as `EXDATE`, and open records as their own VTODOs; a `RECURRENCE-ID` override or an `EXDATE` a client sends becomes the matching record (`series-exceptions`). The Markdown vault writes the series line at its current occurrence as today and each open record as an ordinary task line; done and skipped records stay out of the files. Calendar sync to a user's own calendar keeps writing the next occurrence only.

## Decisions

### D1. `occurrence_date` on the record, not a list on the series

The record carries `occurrence_date` (`kDate`, nullable), written once in the batch that creates it. Recognising a record becomes `series_id === S && id === occurrenceId(S, occurrence_date ?? due.date)` everywhere (client `completedOccurrences`, server `RecurringCompletion`, vault). The server refuses `occurrence_date` on a task without `series_id` (`invalid_input`), and refuses a change to it once set, as `section.project_id` is refused after creation.

- **Alternative: an `exdates` list on the series** (issue #551's suggestion). Rejected: a whole-list register loses one of two exceptions added offline on two devices (M4), and the record carries the information already.
- **Alternative: a set-merge field kind for exdates.** Rejected: a new merge semantic in the op log for something the records already express.
- **Alternative: no stored date, recognise records by id only.** Rejected: the id is a hash; without the date a moved record cannot be told apart from a standalone task, and CalDAV needs the RECURRENCE-ID.

**Data model impact:** one additive field, no rename, not content. Clients read a missing value as null.

### D2. Exception-aware planning in one module, ported to Go

`web/src/lib/recurring.ts` grows from "current occurrence" to "any occurrence date":

```
recordsOf(series, tasks)                    // records by series_id, with their occurrence date and state
exceptionDates(series, tasks)               // M4
nextFree(series, rule, after, tasks, today) // first occurrence date after `after` that is not an exception, within bounds (M6)
planActOn(series, date, action, tasks, now, today) // action: complete | skip | move(due) | edit(patch) | detach
planCarry(series, before, after, tasks)     // D6
planRepair(series, tasks, today)            // M5
```

`planActOn` on the current occurrence writes the record and moves the series to `nextFree`; on a future date it writes only the record (the series stays), with its deadline and start shifted by the distance from the series' due date, as rolling shifts them (`shiftDate`). Completing the last occurrence the budget allows ends the series as today. `occurrencesInRange` (`series-occurrences`) leaves out exception dates and counts open records against the budget.

The server gets the same functions in Go (`internal/sync/occurrences.go`), used by `RecurringCompletion`, the new routes and CalDAV, and the vault reuses them for rolling. One fixture, `web/src/lib/series.fixture.json`, lists inputs (series row, records, today, action) and expected changes; vitest and `go test` both run it, as `web/src/lib/rules/plan.fixture.json` does for automations. The occurrence vectors from `series-occurrences` gain exception cases.

### D3. Removing an occurrence is a skip, never a tombstone

Skip writes the record with `completed_at` and `skipped: true` for every series (habits did it already; a non-habit's skip of its *current* occurrence still writes no record, as today, because the series moving on is enough). "Delete this occurrence" in a projection's menu is the same skip, labelled for what people mean. Deleting an open record from the app also writes the skip. A tombstone would make the exception vanish at purge, and a purged id can never be written again, so a later completion of that date would be discarded.

A trashed record written by an older client still counts as an exception while it exists; the risk after purge is noted below.

### D4. Acting on a projection

- **Drag** a projection (Day, Week, Month, Plan) to another slot or day: moves this occurrence only. One batch writes the open record with the new `due` and the series' other fields; a toast offers Undo. Keyboard: the projection's menu has **Move to…**, which opens the date and time picker. No dialog asks "this or all": dragging the series row keeps moving the series as today, dragging a projection moves one occurrence, and the panel's scope control offers the rest.
- **Menu** on a projection (context click, long press, `Shift+F10` or the menu key on a focused projection): **Open**, **Complete this occurrence**, **Skip this occurrence**, **Move to…**. On a habit, Skip reads "Skip this day".
- **`j` and `k`** keep skipping projections (Plan, Month and Day/Week keyboard models are unchanged); Tab reaches them, Enter opens the occurrence panel.
- Who can act: anyone who may edit the series. A viewer of a shared project gets Open only, and drag does not start.
- Completion-relative series: Open only; their future dates are hypothetical.

### D5. The occurrence panel and its scope control

The detail panel of a recurring series, a projection or a record shows a two-option control under the title row (a segmented control from `web/src/ui`): **This occurrence · All occurrences** (`series-split` adds **This and following**).

- Opened from the series row (lists, Today, a block on the current date): **All occurrences** selected. The panel is today's series panel. Switching to This occurrence shows the same fields for the current date; the first edit writes the current occurrence's record and moves the series to `nextFree`, which is what "This occurrence only" (`Shift+O`) does in one step. `Shift+O` keeps its key and now writes the record (`occurrenceId`) instead of a `detachedId` copy.
- Opened from a projection: **This occurrence** selected, with a header line "Wednesday 14 October · one occurrence of a repeating task". Fields show the series' values; the first edit materialises the record with that edit. Complete and Skip buttons sit where the series panel shows Skip.
- Opened from a record (it is a real task in lists on its date): **This occurrence** selected; edits go to the record as to any task. The row in lists shows the repeat mark with the tooltip "One occurrence of <series title>".
- Switching to **All occurrences** from a projection or record shows the series row's panel.

No prompt on save: the scope is chosen before editing and stays visible. The control appears only on recurring tasks, so Simple-list users and every non-recurring task see nothing new. It sits in the panel, not above a list, so the two-row chrome budget is untouched.

- **Alternative: Google Calendar's prompt on every save.** Rejected: a modal per edit is not calm, and keyboard editing in the panel saves per field.
- **Alternative: a separate occurrence page.** Rejected: duplicates the task panel.

### D6. All-occurrences edits carry to untouched open records

When the series' title, priority, labels, project, section, estimate, due time and zone, assignee or location changes under All occurrences, the same batch also writes the new value to every open record of the series whose value of that field still equals the series' previous value. A record whose field was changed alone keeps it. Done and skipped records never change. Notes are not carried (a merged rich-text document has no "previous value" to compare), and neither is the record's date. On an encrypted account the comparison is of decrypted values, on the device. A REST `PATCH` of the series changes the series only (documented); the carry is a client behaviour, like the copy of fields at materialisation.

### D7. Reminders of a materialised occurrence

Materialising an occurrence copies each relative reminder of the series (offset from the due time) onto the record, with ids `nameId("occurrence-reminder", "<record id>:<reminder id>")` so devices converge, and `fire_at` computed from the record's own due. Absolute reminders and deadline reminders are not copied: they name a moment, not an occurrence. The series' reminders keep following the series.

### D8. Repair (M5)

`planRepair` runs after a sync pull on each series the device may edit whose `due.date` is an exception date, writing `due`, `deadline` and `start` to `nextFree` from that date, shifted as completion shifts them. Every repairing device writes the same values, so concurrent repairs converge. If no free date remains within the bounds, the series completes as at its end condition. The server does the same before it writes a completion, so an API completion never lands on an exception.

### D9. Counting with records (M6)

The remaining budget of a `for N times` series is `N − done − open`, where done and open count the records of the series (skipped ones never). The walk of the current occurrence and the projections stops when it reaches the budget. Completing an open record turns it from open to done: the budget is unchanged. Completing the series when the budget is one ends the series as today. Two devices completing the same future date converge on one record (same id), as completions already do.

### D10. CalDAV mapping

- **Served series:** DTSTART/DUE as today; `RRULE` from the rule, except that `for N times` is served as `UNTIL=<last occurrence date>` computed with the budget (D9) instead of `COUNT`, because DTSTART is the current occurrence, not the first, and RFC 5545 counts EXDATE'd instances. An inbound RRULE equal to the one served (`SameRRULE` against the served value) leaves the rule unchanged.
- **EXDATE:** every exception date on or after the current occurrence, in DTSTART's form (DATE, floating or zoned DATE-TIME), one `EXDATE` property.
- **Open records** are served as their own VTODO resources (their own UID, no RRULE, `RELATED-TO;RELTYPE=SIBLING:<series UID>`), as detached copies are today.
- **Inbound** on the series' object: a new `EXDATE` date → skip that occurrence; an `EXDATE` removed → the skipped record of that date becomes open again; an override (`RECURRENCE-ID`) with `STATUS:COMPLETED` (or `COMPLETED` set) → complete that occurrence, current or future; with `STATUS:CANCELLED` → skip; with a changed `DUE`/`DTSTART`, `SUMMARY` or `PRIORITY` → move or edit that occurrence (an open record). Overrides are never stored in `ical_extra`; the next fetch serves the series with the EXDATE and the record as its own object. Overrides of dates that are not occurrence dates, or before the current occurrence, change nothing (as "Override of another day" did).
- Writes go through `ApplyStrict` with device `caldav:<app-password-id>`.

### D11. API and CLI

- `POST /api/v1/tasks/{id}/occurrences/{date}/complete` and `/skip` (body optional: `{"completed_at"}`), and `PATCH /api/v1/tasks/{id}/occurrences/{date}` with task fields (`due`, `title`, `priority`, `labels`, `estimate_minutes`, `description`, …) materialise or update the record and answer it. Policy `signedIn`; refused for `read` tokens and for `agent` tokens (they write only through agent routes); not demo-denied (ordinary task writes). Errors: `404 not_found` (task not visible), `403 forbidden` (viewer), `400 not_recurring`, `400 not_an_occurrence` (a date the series does not produce and that has no record, a date before the current occurrence, a completion-relative series), `400 invalid_input`, `401`.
- `GET …/occurrences` (from `series-occurrences`) adds the states `open`, `done` and `skipped` with `record_id`.
- `ot task occurrence <id> <date> complete|skip`, and `ot task occurrence <id> <date> edit --due … --time … --title …`.
- The agent tools' task output carries `occurrence_date` on records.

### D12. Encrypted accounts

Devices encrypt content into records themselves. The server writes REST and CalDAV records with no content field when the account is encrypted (`e2ee.IsCiphertext` on the series' title), and clients display a record's empty title and notes from its series, marked in history as "from the series". An unlocked device that meets such a record writes the series' current content into it, encrypted for the record (idempotent; concurrent fills write the same plaintext, LWW keeps one). This also fixes today's server completions on encrypted accounts.

## Risks / Trade-offs

- **A trashed record from an older client, purged, returns its date as a projection, and a later action on that date is discarded** (purged ids never return). Mitigation: the app never tombstones records (D3); the case needs an older client plus purge. Documented.
- **Repair churn** if two devices disagree on records for a while: each repair is the same pure function of synced rows, so at most one extra op per series per sync.
- **Thunderbird and Apple may show an override as a duplicate** until the next fetch replaces it with EXDATE plus a separate object. To be verified on the real-client table (`caldav-verified`).
- **Carry surprises** (D6): a record keeps a field changed alone, which is what Google Calendar does too.

## Migration Plan

No migration. Records without `occurrence_date` are read by their due date. Existing `detachedId` copies stay standalone tasks.

## Open Questions

- Should a skipped future occurrence be visible somewhere (a faint "skipped" marker in the calendar) so it can be restored? Proposed: not now; the habit grid shows habits' skips.
