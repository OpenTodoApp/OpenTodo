## Why

`fix-recurring-tracked-time` (#1008, issue #1004) made a repeating task's tracked total count only its current occurrence. That is the right figure against the estimate in the app, but the same change also changed what three 1.0 surfaces read: the agent tools' `tracked_minutes` (MCP, the in-app assistant), the automation condition `tracked` (server and device), and the filter terms `tracked` and `tracked cmp duration` (saved views, routine Find tasks steps). `docs/stability.md` says that within 1.x only additions are allowed and that changing what a field means needs a new major version. An MCP client, a routine or a saved view written against 1.0.0 gave other answers on a repeating task.

## What Changes

- `tracked_minutes` goes back to every entry of the task, as in v1.0.0. A new optional result field `tracked_minutes_occurrence`, on a repeating task only, carries its current occurrence's minutes.
- The automation condition `tracked` keeps the 1.0 meaning, on the server and in the device's routine runner. No new condition option: see design D3.
- The filter terms `tracked` and `tracked cmp duration` keep the 1.0 meaning. A new form `tracked occurrence` and `tracked occurrence cmp duration` reads the current occurrence; it was a syntax error before, so no saved query changes meaning. The condition editor offers it as **All occurrences** turned off.
- The app's own figures stay per occurrence, as #1008 made them: the row chip, the Time tab's total and tab label, its "All occurrences" line.
- Shared vectors in both languages and tests pin the 1.0 meaning of `tracked_minutes`, the `tracked` condition and the `tracked` filter terms next to the new forms.

Out of scope: a per-occurrence routine condition (design D3), any change to the app's per-occurrence display, statistics or the CSV export. Not **BREAKING**: it restores the 1.0 meaning and only adds a response field and a filter form; no op, field or environment variable changes. A follow-up of #1008; no ROADMAP.md row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `time-tracking`: the API, routines and filters keep the total; the app's display and the new field and term read the current occurrence.
- `filter-queries`: `tracked` keeps the 1.0 meaning; `tracked occurrence` is added.

## Impact

`internal/agenttools/data.go` (`tracked_minutes`, `tracked_minutes_occurrence`), `internal/rules/engine.go` and `routine_steps.go` (both totals, the condition reading every entry), `internal/filter` (`tracked occurrence`, `Context.TrackedOccurrence`); `web/src/lib/filter` (parse, print, evaluate, builder), `web/src/lib/timeEntries.ts` (the shared totals hold both maps; rows read the occurrence, filters the total), `web/src/lib/rules/run`, `web/src/app/filter` (the editor's **All occurrences** switch, two new strings in every catalog), the filter contexts of `FilterView`, `useViews` and `Sidebar`. Vectors: `web/src/lib/filter/evaluate.vectors.json` (`tracked_occurrence`), `internal/timetrack/testdata/occurrence_fixture.json`, `internal/filter/testdata/formatted.txt`. Docs: `docs/mcp.md`, `docs/api.md`, `docs/filters.md`, `docs/time-tracking.md`, `docs/recurrence.md`.
