## Context

A repeating task is one row (the series) that moves to its next date; completing it writes an occurrence record (an id derived from the series and the occurrence date, `series_id`, `occurrence_date`, `completed_at`) and moves the series, in one batch. A habit's skip writes a record marked `skipped`; a plain series' skip only moves the due date. Time entries carry `task_id`, the series' id, for every occurrence. `totalsByTask` (`web/src/lib/time.ts`, Go `timetrack.TotalsByTask`) summed every live entry per task.

## Decisions

### D1. The current occurrence starts at the latest record before it

`occurrenceStarts(tasks)` gives, per series, the greatest `completed_at` among its live occurrence records (done or skipped) whose occurrence date (`occurrence_date`, else the due date for a record written before the field) is before the series' due date and whose id is the derived record id. That is when the series last moved on by a completion or a habit's skip. Records that leave it alone: a later occurrence completed ahead (the series did not move), an open record ("This occurrence only"), a trashed record (an Undo of a completion trashes it, so the boundary goes back with it), a reopened record. No new field and no stored value: every device and the server compute it from rows they already hold, so it converges with the records.

Alternative rejected: moving entries onto the record at completion. It rewrites data, races with a running entry on another device and leaves the "all occurrences" figure scattered.

### D2. An entry belongs whole to the occurrence it started in

`totalsByTask(entries, now, since)` skips an entry of a task in `since` that started before the task's start; a running entry started before a completion is the past occurrence's, like an entry across midnight belongs to the day it started. Completing a task already stops its running entry in the same batch.

### D3. One total for everything shown against the estimate

`currentTotals(entries, tasks, now)` (Go `CurrentTotals`) is the total of the row chip, the Time tab, the `tracked` filter terms and the automation condition, and of `tracked_minutes` in the agent tools. The filter's `tracked > 1h` reads the current occurrence for a repeating task: a saved view such as "over an hour tracked and due today" is about the occurrence at hand, and it agrees with the chip the list shows. Reports that count entries by day (statistics, the CSV export, Today's header, the Tracked time routine step, `list_time_entries` and its `total_minutes`) are not "tracked vs estimate" and keep every entry.

### D4. The Time tab keeps the history visible

The tab lists every entry as before; "Total" is the current occurrence's, and a second line, "All occurrences 1h 20m", appears only when it differs. No new control or row of chrome.

## Data model impact

None: no field, op or migration. The shared totals store in `timeEntries.ts` also subscribes to the shared task snapshot (one subscription for the whole app) and works out the starts only for tasks that have entries; the hashing of a record id runs only for completed rows pointing at such a series.

## Interface budget

The Time tab's header gains at most one muted line beside its total; no new chrome row above a list, no new task property, destination, scroll region or shortcut. Bundle: a few hundred bytes in the first-load chunk (`time.ts`, `timeEntries.ts`).

## Risks

- A plain series' skip writes no record, so time tracked before it stays with the next occurrence; documented, and a later change could give plain skips a record.
- Completing a long-detached old record late moves the boundary to that completion; such a record's own entries sit on the record's id, so only entries tracked on the series between the two times move to "All occurrences".
