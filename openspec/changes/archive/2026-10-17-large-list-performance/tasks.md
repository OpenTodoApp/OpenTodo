# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/`.

## 1. Lists

- [x] 1.1 Memoize `TaskRow` and render list rows through a memoized `ListRow` with stable actions and a boolean `selected`; verify with `listPerformance.test.tsx` "j and k re-render only the rows whose selection changed (2000 rows)".
- [x] 1.2 Shared live snapshot of visible tasks with selectors (`lib/liveTasks.ts`) used by the list, sidebar, sub-projects, project header, labels, calendar, month, filter, triage, review, display, palette, task panel and saved views; first-run check stops at the first task; verify with `listPerformance.test.tsx` "one write reads the tasks table once for the list, the sidebar and the project header (2000 tasks)" and the full suite with the snapshot frozen under test.
- [x] 1.3 One shared membership map for rows when encryption is on; verify with `listPerformance.test.tsx` "with encryption on, rows share one membership lookup instead of a live query each (300 rows)".
- [x] 1.4 Linear grouping (`lib/collections.ts`) in the list, comment attachments and public lists; verify with `collections.test.ts` "groups 20,000 items in one group in linear time".
- [x] 1.5 Decide on windowing; recorded in design D3 (not done).

## 2. Encryption

- [x] 2.1 The re-write job reads each batch along the primary key; verify with `e2ee.test.ts` "reads each task about once per run, not the whole table per batch (large-list-performance)" and the existing migration tests.

## 3. Checks

- [x] 3.1 `npx tsc -b`, `npm run lint`, `npm test` (twice), `make ui-lint`, `npm run build`, the Chromium layout check.
