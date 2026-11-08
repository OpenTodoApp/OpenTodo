# Proposal

## Why

`performance-10k` measured the app with a 10,000-task account (docs/performance.md). Its first runs fixed the first sync (about 145 s to about 12 s), search and the server, but the list interactions in the 2,000-task project stay far over their desktop budgets on the development machine (the CI runner's numbers are in the `performance-10k` pull requests):

| Metric | Measured | Budget |
| --- | --- | --- |
| Open the 2,000-task project | 1,500 ms | 400 ms |
| Complete a task in that list, to the next frame (p95) | 1,500–3,000 ms | 50 ms |
| An edit from another device painted (live channel) | 2,000–3,000 ms | 1,000 ms |
| Cursor move with `j`/`k` near the top (p95) | 150–230 ms | 16 ms |
| Saved view of eight clauses | 170 ms | 100 ms |

The profiles agree on two causes:

1. **Every row is laid out.** Opening the project lays out all 2,000 rows before the first frame (about 1.5 s of style and layout); each later change re-lays out the list.
2. **Every write re-reads every task.** The shared tasks snapshot (`large-list-performance` D2) is one Dexie live query: one completion or one pulled edit reads all 10,000 tasks again, then the list's derived data is rebuilt and many rows re-render. A completion shows its tick only after that round trip.

`performance-10k` task 3.2 says a change that needs windowing (or anything with its risks) gets its own change. This is it.

## What Changes

- **Rows off screen cost no layout or paint**: list rows get `content-visibility: auto` with an intrinsic size, so the browser lays out only the rows near the viewport, while every row stays in the DOM (keyboard focus, find in page, drag and drop, screen readers and the count checks keep working). The drop line and the row's pinned controls stay visible (`overflow-clip-margin`).
- **A write patches the snapshot instead of re-reading it**: the shared tasks snapshot applies the changed rows of each committed transaction (read with one `bulkGet` of the changed keys) to the array it holds, falling back to a full read when the change set is unknown or large.
- **The tick paints at once**: completing a task marks its row done in the same frame, before the write and the snapshot catch up; a failed write puts it back.
- **Windowing only if the above misses the budgets**, with its own design for focus, drag and drop and find in page.

No data model, sync, API or op schema change. Offline behaviour and convergence are unchanged: only how the screen reads and draws local data changes.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: "Large lists stay responsive" gains the layout and write-cost rules above.

## Impact

- Web app only: `TaskRow` and the list CSS, `lib/liveSnapshot.ts` / `lib/liveTasks.ts`, the completion path of the row.
- Measured by `performance-10k`'s benchmark (`make perf`); the budgets are not raised.
- Bundle: under 1 KB.
