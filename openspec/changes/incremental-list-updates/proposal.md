# Proposal

## Why

Completing a task in the 2,000-row project of the 10,000-task account measured 184, 184 and 224 ms on the nightly phone profile, and 224 ms locally on main (budget 200 ms, `scripts/perf/budgets.json`). A typical click takes 110–150 ms; the slow ones wait 50–120 ms for the previous completion's follow-up work: a synchronous redraw of 150–250 ms when the write lands (the list model over every task, the sidebar counts, the row comparisons), a second list redraw when the departing row's animation ends, and animation frames of 40–75 ms, 10–25 ms of each spent working out which of the 2,000 rows the browser may skip (`content-visibility: auto` on every row). The owner chose to fix this before 1.0.0 final by reworking the list data path rather than raising the budget.

## What Changes

- **A write updates what is derived from the tasks from the changed rows.** The shared task snapshot already patches its rows; it now also patches its visible sets and notes which rows changed, and the values derived from it (the task index, the open tasks, progress, blockers, habits, flows, a view's tasks, a project's completed tasks, the sidebar counts and the app badge count) follow those rows instead of going over all tasks. Anything a patch does not follow is worked out in full, which gives the same result.
- **Rows compare only what a write could have changed.** A derived map notes the keys it changed, and the list's rows compare their answers only for those keys.
- **One list redraw per completion.** A departing row removes itself when its moment ends, so the end of the animation no longer redraws the list.
- **Long lists skip blocks of rows.** Rows are drawn in blocks of about 50 that keep their rows from one drawing to the next; the browser skips whole blocks far from the viewport instead of each row, so a frame and a hit test no longer go over 2,000 rows. The blocks are presentational: each row stays an item of its list for assistive technology.
- **An equivalence test** applies random sequences of writes and checks every incremental value against a full recomputation.

No data model, op schema, sync, API or budget change. Offline behaviour and convergence are unchanged: only how the screen derives and draws local data changes.

Out of scope: windowing (rows taken out of the document), the saved-view and workspace counts (already counted once the writes stop), the command bar's index, and the benchmark's method (10 samples, slowest of ten, median of five runs, no idle wait between clicks). Advances ROADMAP's 1.0 performance item (`performance-10k`).

## Capabilities

### New Capabilities

### Modified Capabilities

- `task-list-presentation`: a requirement that list updates, counts and badges follow the changed rows, that a completion redraws the list once, and that a long list skips blocks of rows without splitting the list for assistive technology.

## Impact

- Web app only: `lib/taskSnapshot.ts`, a new `lib/taskDelta.ts`, `lib/liveTasks.ts`, the derivations in `lib/subtasks.ts`, `lib/dependencies.ts`, `lib/habits.ts`, `lib/flow.ts`, `lib/listGroups.ts`, `app/task-list/useListModel.ts`, `app/task-list/ListGroups.tsx`, `app/task-list/TaskListRow.tsx`, `app/Sidebar.tsx`, the row CSS, and `scripts/perf/a11y-list.mjs` (it counts the skipping rule on blocks).
- Measured with `scripts/perf/run.mjs` on the phone and desktop profiles; no budget changes.
- Bundle: a few KB before gzip, within `web/bundle-budget.json`.
