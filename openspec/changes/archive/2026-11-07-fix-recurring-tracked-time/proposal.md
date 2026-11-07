## Why

A repeating task is one task row that moves on to its next date when it is completed (OpenSpec `recurring-tasks`, `series-exceptions`). Time entries hang on the task's id, and every tracked total summed every live entry of the task, so the next occurrence started with the previous occurrences' time and "tracked vs estimate" was wrong from the second occurrence on (#1004).

## What Changes

- The tracked total shown against a task's estimate counts, for a repeating task, only the entries that started since its current occurrence began: the latest completion or skip among the series' live occurrence records dated before its current due date. An entry counts whole for the occurrence it started in.
- Every place that shows or reads that total agrees: the row chip, the task panel's Time tab and its tab label, the `tracked` filter terms (Filter view, saved views, sidebar counts, the server's evaluator), the automation condition `tracked`, and the agent tools' `tracked_minutes` (MCP, the in-app assistant).
- The Time tab keeps listing every entry and, when earlier occurrences have entries, adds "All occurrences" with their sum under the total.
- Reports keep counting every entry by its day: statistics, the CSV export, Today's tracked total, the routine step Tracked time and `list_time_entries`.

Out of scope: writing a record for a plain series' skip (a plain skip writes no record, series-exceptions D3, so its time stays with the next occurrence), moving entries to occurrence records, any data, op or API change. Advances no ROADMAP.md item; a fix for #1004.

## Capabilities

### New Capabilities

### Modified Capabilities
- `time-tracking`: a repeating task's tracked total is its current occurrence's.
- `filter-queries`: the tracked time terms read the same total.

## Impact

`web/src/lib/time.ts` (`occurrenceStarts`, `totalsByTask` with `since`, `currentTotals`) and its Go twin `internal/timetrack` (`OccurrenceStarts`, `CurrentTotals`), pinned by the new shared fixture `internal/timetrack/testdata/occurrence_fixture.json`; `web/src/lib/timeEntries.ts` (the shared totals follow the tasks too, `useOccurrenceStart`), `web/src/lib/liveTasks.ts`, `web/src/app/task-detail/TimeTab.tsx`, `web/src/lib/rules/run/state.ts`, `internal/agenttools/data.go`, `internal/rules/engine.go`. One new string in every catalog. No data, op schema, API route, dependency or setting changes; works offline from local rows as before.
