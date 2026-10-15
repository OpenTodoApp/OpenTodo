# Proposal

## Why

A task has one date, `due`, and it has to mean two things at once: the day the person plans to work on it and the day it must be finished. Someone who plans "write the report" for Tuesday and must deliver it by Friday has to pick one, and loses the other. Things and Todoist both separate the two, and the named importers for their exports (`named-importers`) currently drop a deadline with a warning or demote it to a description line because the model has nowhere to put it (`internal/importer/profile_json.go:545`, named-importers design D7). The comparison pages on open-todo.app concede the gap. This change adds the deadline as its own date, kept separate from the scheduled day everywhere: rows, Today and Upcoming, filters, reminders, CalDAV, quick add and import.

## What Changes

- **A `deadline` field on tasks:** an optional floating calendar date (`YYYY-MM-DD`, no time, no zone), independent of `due`. Additive in the op schema, settable offline, converging per field by last-writer-wins like every task field, carried by the export and the REST collection, plaintext on end-to-end encrypted accounts like `due`.
- **Countdown on rows and in the panel:** a task with a deadline shows how many days remain (`3d`), `Today` on the day, or how many days it is over (`2d over`), with a tone that sharpens inside a week and turns to danger on the day and after. The detail panel gets a **Deadline** row next to **Due** that uses the same date field and calendar as the due date (`date-time-preferences`). `d` on a selected row sets it from the list, like `e` sets the estimate.
- **Today and Upcoming:** Today also lists open tasks whose deadline is today or earlier (a past deadline joins the Overdue group), so a deadline cannot slip by unseen, and the sidebar count follows. Upcoming lists a task with a future deadline and no due date under its deadline day; a task with both dates stays under its due date and carries the countdown.
- **Filters:** `deadline <cmp> <date>` with the same comparisons and date expressions as `due`, and the keyword `no deadline`. Tasks without a deadline never match a comparison.
- **Reminders:** a third reminder kind, `deadline`, fires at 09:00 local on the deadline plus its offset in minutes and is recomputed by the device that moves the deadline, in the same batch, exactly as relative reminders follow `due`. A new kind rather than a flag on relative reminders, so a client that predates it skips the reminder instead of moving it with the due date.
- **CalDAV:** a task with a deadline is served with `DUE` = deadline (as a DATE) and `DTSTART` = the scheduled day (date or date-time, zoned or floating); a task without a deadline keeps today's mapping (`DUE` = due). Inbound, a VTODO whose `DTSTART` and `DUE` differ becomes due = `DTSTART`, deadline = the date of `DUE`; one with only `DUE`, or equal values, maps as today. This is what the two properties mean in iCalendar (RFC 5545 §3.8.2.4 and §3.8.2.3) and what Tasks.org, Thunderbird and Apple Reminders do with a start and a due date.
- **Quick add:** the word `deadline` (and its equivalent in the five other bundled languages) in front of a date phrase sets the deadline instead of the due date: `Report deadline friday` is due nothing and must be done by Friday; `Report tuesday deadline friday` is planned for Tuesday. `by` keeps meaning the due date, as documented today.
- **Recurring tasks:** when a series moves to its next occurrence, a deadline moves by the same number of days as the due date, so "plan Monday, deadline Wednesday" repeats as such; the completed occurrence record keeps the deadline it had.
- **Import:** the Todoist `DEADLINE` column, the Things `deadline` value and the `deadline` key of the generic JSON profile map to the field, replacing today's warnings and the description line; the CSV format gains a `deadline` column, and the own export round-trips the field.

Out of scope:
- A time of day or a time zone on the deadline. It is a day, like Things' and Todoist's deadlines; a timed commitment is a due time.
- Validating the deadline against the due date. A due date after the deadline is shown with the danger tone, not refused: per-field last-writer-wins cannot enforce a relation between two fields written by different devices.
- Sorting or grouping saved views by deadline, a "deadline" column in the calendar views, and a Month or timeline view (`month-and-timeline-views` builds on this field).
- The assistant, MCP and agent tokens. Their task projection and write allow-list are explicit (`internal/agenttools/data.go:256`, `internal/agenttools/write.go:63`, `internal/httpapi/agent_rest.go:301`) and gain `deadline` in a later change; until then the assistant does not see or set deadlines. The CLI (`ot add --deadline`) follows in the same later change.
- Start dates, Someday and This Evening (`someday-and-evening`, the next roadmap row).

ROADMAP: advances "Next: Parity and depth" row 1, **Deadlines** (`deadlines`). `named-importers` waits for this change to map Todoist and Things deadlines; `month-and-timeline-views` builds on the field.

Nothing here is **BREAKING**. The op log gains one additive field (`task.deadline`) and one additive enumeration value (`reminder.kind` = `deadline`); an older server rejects an op on an unknown field or kind as invalid, as for every additive change before, and an older client stores and forwards the values untouched. No environment variable is added.

## Capabilities

### New Capabilities
- `deadlines`: the deadline date on a task: its storage and sync, independence from the due date, how it is entered, how the countdown is shown, and how it places a task in Today and Upcoming.

### Modified Capabilities
- `filter-queries`: new `deadline` date term and `no deadline` keyword.
- `reminders`: a `deadline` reminder kind that follows the deadline; the entity requirement lists three kinds.
- `caldav-sync`: `DUE` and `DTSTART` carry the deadline and the scheduled day when a task has both; the property mapping and the due-forms requirement change accordingly.
- `natural-language-capture`: the `deadline` phrase sets the deadline.
- `recurring-tasks`: the deadline follows the series to its next occurrence.
- `data-import`: Todoist, Things, generic JSON and CSV deadlines map to the field; own export round trip.

## Impact

- **Op schema:** `task.deadline` with a new kind `kDate` (null or a valid `YYYY-MM-DD`, validated with the `isDate` helper the `kDue` branch already uses, `internal/sync/ops.go:352-362`) and the value `deadline` for `kReminderKind` (`internal/sync/ops.go:73`). `web/src/lib/types.ts` (`Task.deadline`, `ReminderKind`), the defaults in `web/src/lib/ops.ts:60-63` and the reminder follow-up in `ops.ts:378-405`, `docs/sync.md` schema table. Neither value is user-written text, so `internal/e2ee.ContentFields` and `CONTENT_FIELDS` are unchanged. No Dexie version bump: rows synced before the field existed hold `undefined` and are read as `null`, the `notes_doc` precedent.
- **Web:** `lib/dates.ts` (countdown and tone), `TaskRow.tsx`, `TaskListView.tsx:122-125` and `:219-236` (Today and Upcoming selection and grouping), `Sidebar.tsx:55-64` (Today count), the detail panel properties card (`DueField.tsx` sibling), `lib/filter/parse.ts` and `evaluate.ts`, `lib/nlp/dates.ts` and the six vocabularies, `lib/recurring.ts:41-43` (`moveDue` gains the deadline shift), `lib/history.ts:48` and `lib/activity.ts` fixtures, `RemindersField.tsx` (deadline presets), `internal/push` and `lib/reminderWatcher.ts` need no change (they compare `fire_at` with the clock).
- **Server:** `internal/caldav/vtodo.go:107-151` (encode) and `:319-400` (decode), `internal/caldav/filter.go:117-118` already handles both properties; `internal/importer` (`plan.go` row model, `profile_csv.go` columns, `profile_json.go:375` and `:545`, `profile_opentodo.go`), `internal/recurrence` untouched (the client computes the shift; the REST completion path in `internal/httpapi/recurring.go` applies the same rule). `internal/activity` fixture gains a `deadline` op that yields an `edited` event. No new route, nothing for the demo deny list.
- **Docs:** `docs/tasks-and-projects.md`, `docs/views.md`, `docs/filters.md`, `docs/quick-add.md`, `docs/recurrence.md`, `docs/reminders.md`, `docs/caldav.md`, `docs/import.md`, `docs/api.md` task fields, `docs/sync.md`; the help bundle is regenerated.
- **Size:** no new dependency. One vendored Lucide icon (`hourglass`) for the deadline chip, under 1 KB; the countdown, parser words and filter term add about 2 KB gzipped to the web bundle. Binary and memory unchanged apart from the embedded bundle.
