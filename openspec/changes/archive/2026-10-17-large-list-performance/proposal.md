# Proposal

## Why

An audit of the web client (UI-1, UI-2, UI-6, UI-7, DATA-17) measured how the app slows down with large lists:

- Moving the cursor with `j`/`k` re-rendered every row of the list: 2,000 row renders per key press in a project of 2,000 tasks, because rows were not memoized and received fresh handlers and the list's selected id on every render.
- About fourteen components ran their own live query over the whole tasks table (the list, the sidebar counts, sub-project counts, the project header count, labels, calendar, month, filter, triage, review, display, palette, the task panel, saved views). With a project open, one write read the table six times (12,001 task rows read for one rename with 2,000 tasks), and every sync batch did the same.
- With end-to-end encryption on, every row opened its own live query to learn whether its project is shared (303 membership reads to render 300 rows).
- Grouping a list by project or a section's completed tasks copied the group's array on every insert (quadratic: 73 ms for 10,000 tasks, 1.5 s for 20,000 in one group).
- Turning encryption on or off re-read the whole table for each batch of 200 rows (quadratic: 19.5 task reads per task for 2,000 tasks, growing with the table).

## What Changes

- List rows are memoized; the list passes stable handlers and per-row values, so a cursor move re-renders only the row it leaves and the row it reaches.
- One shared live snapshot of the visible tasks in `web/src/lib/liveTasks.ts`, with selectors (open tasks, open counts per project); the components above read it instead of their own scans. The project header count and the section "n completed" reveal derive from it; the first-run check stops at the first task; the task panel's parent picker uses the `project_id` index.
- Rows read "is this project shared" from one shared membership map.
- Grouping helpers append in place (`web/src/lib/collections.ts`).
- The encryption re-write job reads each batch along the primary key from where the last batch stopped.

No op schema, API, data model or index change; no new dependency or environment variable. Not **BREAKING**.

**Out of scope**: windowing (virtualizing) long lists: with memoization a cursor move costs two row renders, and windowing would put keyboard navigation, focus, drag and drop (drop zones are found in the DOM), screen reader list semantics, find-in-page and the layout check at risk (design D3). The first render of a very large list still renders every row. Live queries that already use an index or read one task are unchanged. ROADMAP.md item advanced: none; this hardens existing behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: large lists stay responsive (cursor moves, writes and grouping cost in proportion to what changed).
- `end-to-end-encryption`: the re-write job reads incrementally.
