# Design

## Context

- `list-rendering-at-scale` (archived 2026-11-06) made the shared task snapshot patch its rows from the keys a write changed (D2), kept unchanged rows and groups (`keepGroups`, D6), counted the saved views and workspaces once the writes stop (`useSettledValue`, D6) and made a departure draw only its own row (D7). `large-list-performance` (2026-10-17) made one snapshot shared by every list, count and badge.
- Measured on main after #989 (phone profile, five runs of `scripts/perf/run.mjs`): `complete-task` 344, 208, 224, 216, 248 ms, median 224 (budget 200); desktop median 96 (budget 100).
- Profiles of that session (CPU profile and Chrome trace, phone profile; numbers per completion): the redraw when the write lands is one synchronous React render (the snapshot is read with `useSyncExternalStore`) of 116–193 ms: the list model 44 ms (the task index 5, `splitLater` 6, the tree 6, the section buckets 4, the groups 4, blockers 3, a view's tasks 3, completed by section 3, progress 2), the rows' comparisons 32 ms (18 of them asking the new flow state, which worked out each project's sequence again), the sidebar 47 ms. Every frame, even one that only changes the sync dot, spent 10–25 ms in `IntersectionObserverController::computeIntersections` (the 2,000 rows under `content-visibility: auto`), and each hit test (pointer down, pointer up, click) 3–10 ms. The departing row's end redrew the list (20–47 ms).
- Making the redraw a deferred update (`useDeferredValue`) was tried and dropped: React cannot split one component's 60–200 ms render, and cold start rose to 2.5 s.

## Goals / Non-Goals

**Goals:** follow-up work of one completion in the 10,000-task account proportional to the rows it changed; one list redraw per completion; frames and hit tests of a long list independent of its length; every incremental value equal to a full recomputation.

**Non-Goals:** windowing; incremental saved-view and workspace counts (they already wait for the writes to stop); incremental regrouping of flat views beyond their own rows; any change to the benchmark's method or the budgets.

## Decisions

**D1. Task lists note their changes.** `lib/taskDelta.ts`: `noteChanges(prev, next, changes)` links a list to the list it was made from with the changed rows (`{id, before, after}`); `changesBetween(from, to)` follows up to eight links and merges them, or returns null (not linked, too far, more than 1,000 rows). The links live in a `WeakMap` keyed by the newer list, so a list nothing holds goes with its link; since a link holds the list before it, noting a link cuts the chain eight links back (without the cut the first measurement kept every list since start: 4 MB more heap and slow outliers from garbage collection). The snapshot patches its visible sets with the same changes while the projects and workspaces are unchanged (`patchSets`: one sorted splice per changed row instead of filtering 10,000 rows) and notes them; an account with several workspaces derives its sets in full, since a task without a project takes its workspace from its parent. `Derived<V>` (and its per-list cache form) keeps a value from one list to the next: the same list gives the same value, a linked list gives `patch(previous value, changes)`, anything else or a patch that returns null gives `full`. Alternatives: a version counter per snapshot and a ring of deltas (kept lists alive by number, not by reference; the WeakMap needs no bookkeeping); immutable persistent collections (a dependency and a rewrite of every consumer).

**D2. What is derived from the tasks follows the changed rows.** Each derivation keeps its full form and gains a patch that handles the common changes exactly and returns null for the rest:

- per snapshot, shared by every consumer: the task index (a `LayeredMap`: the changed entries over the previous index, looked up through at most eight layers and copied once when deeper or iterated; copying 10,000 entries took about 5 ms in the phone profile), the open tasks (a sorted splice), open counts per project (plus and minus);
- progress: plus and minus per parent of a changed row;
- blockers: the same map when no changed row has or is a blocker; the changed rows and their dependents recounted when no `blocked_by` (or its clock) changed and no row came or went; otherwise in full (cycles are broken over the whole graph);
- habit streaks: the same map unless a changed row has a series, a habit or a split lineage;
- flows: a new `FlowState` keeps the worked-out sequence of every project no changed row belongs to, so asking it for 2,000 rows is a lookup each, and a project that is not in sequence no longer sorts its loose tasks to find that out;
- a view's tasks: views whose membership is a test of the task alone (a project, a label, a place, assigned, Someday, Anytime, Today, Upcoming, Completed) remove the changed rows and insert the ones that pass at their place in the view's order (the order with the id last, which is what a stable sort of the id-ordered snapshot gives); the Inbox only when no changed row's placement or parent changed (a parent's placement moves its subtasks);
- a project's completed tasks by section: only when a changed row is in the project;
- Today's Done today group: a sorted patch, as the views;
- the sidebar's Inbox, Today and assigned counts, open counts per project and per label, the sub-project and favourite counts, and the app badge: plus and minus per changed row, with the same conditions as their views (the Inbox count follows every visible task, not only the open ones: a done parent that is deleted moves its subtasks into the Inbox).

A project's or the Inbox's tree follows its view (`patchTreeParts`): a task that leaves without subtasks, or changes without moving (the same parent, position, section, project and start), is taken out of or swapped into the Later split, the tree (the nodes above it copied, every other subtree kept) and its section bucket; a task that comes, moves or leaves with subtasks rebuilds them. The groups are then built from the view's own rows (its 2,000 tasks, not the account's 10,000), and `keepGroups` keeps every row and group that did not change, as before.

**D3. Rows compare only what a write changed.** A patched map notes the keys it may answer differently (`noteKeys`; `keysBetween` follows the links). The list's row renderer works out once per drawing which rows may read differently (those keys, and the rows the cursor, editing, expanded, adding and drop fields name) and keeps every other row's element without looking at its answers; a row that passes moves its cached context forward, so the next write starts from it. A map without a link (worked out in full), a new tick set, a drag that starts and new projects or memberships compare every row as before.

Two costs of the same redraw that the profiles showed are cut too: the tree list's sibling positions are written from the browser's live list of items instead of a query over every row (about 15 ms in one piece in the phone profile, in an idle moment), and a departing row's collapse starts from its own height with `interpolate-size: allow-keywords` where the browser has it, instead of measuring the row in the commit (a layout of the list, about 15 ms).

**D4. One list redraw per completion.** The departing row (the ghost the list keeps in place) follows its own departure (`useDeparture`) and draws nothing once it ends or Undo turns it into a restore; the list forgets the ghost when it next draws for another reason. The list no longer subscribes to the end of departures. The 400 ms moment, Undo and reduced motion behave as before.

**D5. Long lists skip blocks of rows.** A list of 50 rows or more (until it falls under 25) draws its rows in blocks (`rowBlocks`): a block of about 25 rows keeps its rows from one drawing to the next (a new row joins the block before it, a block that doubles is split), so a row that comes or goes moves no row to another block, which would draw it again. `content-visibility: auto` moves from each row to the block, with an intrinsic size of its rows at the row estimate; a block holding a row that must not be clipped (dragged, dropped on, edited, expanded) draws normally. The blocks are `li role="none"` around `ul role="none"`, and rows inside them say `role="listitem"`, so each row stays an item of its list in the accessibility tree (`scripts/perf/a11y-list.mjs` checks it on the 2,000-row list). Measured in the phone profile on the 2,000-row list (a trace of 20 frames that each change one small element): a frame's lifecycle 15.7 → 4.1 ms, intersection work about 12 → 0.6 ms a frame, a hit test 2.8 → 0.9 ms. Blocks of 50 cut the frames as much but drew twice the rows in the first frame of opening the project (open-project 380 → 465 ms in the phone profile); blocks of 25 keep it at 397 ms. A block's row count (`--block-rows`, its intrinsic size) is a registered property that is not inherited: as an inherited custom property, a row leaving a block restyled every element of its rows (about 800 elements, 55 ms in the phone profile, in the hit test of the next pointer move). Alternatives: blocks by index (a row that leaves moves one row of every later block), `content-visibility: hidden` far away (hides rows from find in page and assistive technology), windowing (rejected in `list-rendering-at-scale` D4).

**D6. The equivalence test.** `incrementalEquivalence.test.ts` builds a seeded random account (projects, sections, subtasks, blockers, habits, sequential projects, dates) and applies random writes (create, edit, complete, reopen, move between projects, sections and parents, reschedule, defer, delete, restore, blockers), each step through the same link the snapshot notes; after every step it compares each incremental value with its full form on the same rows: the snapshot sets, the index, the open tasks and counts, progress, blockers, habits, the flow answers of every task, every view's tasks, the groups of the project and Today lists, Today's closed list fill, the completed tasks by section and the sidebar and badge counts.

## Measured

Local, five runs each of `scripts/perf/run.mjs` on the same fixture and machine; medians (budget), the five runs of complete-task in brackets. The phone profile's slowest of ten varies by about 50 ms from run to run on this machine.

| | main (after #989) | D4, D5 (#992) | all of the change |
| --- | --- | --- | --- |
| phone complete-task (200) | 224 (344, 208, 224, 216, 248) | 88 (96, 120, 80, 88, 80) | 96 (184, 96, 136, 80, 80) |
| phone cursor-move (150) | 93.5 | 65.3 | 69.1 |
| phone open-project (1200) | 380 | 383 | 443 |
| phone search-keystroke (200) | 106 | 107 | 87.4 |
| phone saved-view (300) | 128 | 121 | 136.7 |
| phone cold-start (3000) | 1410 | 1401 | 1355 |
| phone remote edit (not budgeted) | 673 | 631 | 540 |
| desktop complete-task (100) | 96 | 56 | 56 |
| desktop cursor-move (50) | 22.4 | 15.3 | 18.4 |
| desktop open-project (400) | 84.5 | 92.1 | 90.4 |
| desktop search-keystroke, saved-view (100, 100) | 47.2, 29 | 43, 27 | 28.1, 29.2 |
| desktop cold-start (1200) | 412 | 358 | 391 |
| desktop remote-edit (1000) | 142 | 145 | 122 |

What the change does to a completion's follow-up work (phone profile, a performance mark around the snapshot's redraw): the redraw when the write lands 116–193 ms on main, 45–96 ms with the change; the redraw at the end of the departing row's moment 16–47 ms, now 1–3 ms (the ghost row only). The typical click is 56–72 ms; the slowest of ten in a run is a click that lands on the remaining redraw or a sync exchange.

Opening the project in the phone profile measured 383 ms with D4 and D5 and about 440 ms with the whole change in three sets of five runs; profiles of the opening show the same full derivations as before (the tree, the split and the buckets in full on first open, the rows' first mount), and single samples on this machine vary by ±100 ms, so the difference is noted rather than explained. It is within its budget of 1,200 ms.

## Bundle size

Entry chunk 137.0 → 139.1 KB gzip, first load 680.3 → 684.8 KB (budget raised to 140 and 685 KB in `web/bundle-budget.json`, with the reason): the change links (`lib/taskDelta.ts`, with `LayeredMap`), the patch beside each derivation and the sidebar's counts (`lib/sidebarCounts.ts`) run with every list and the first write after start, so they cannot load lazily. D4 and D5 added 0.3 KB.

## Risks / Trade-offs

- [A patch that diverges from the full form shows wrong data] → each patch returns null for any change it does not follow exactly, the equivalence test compares them after random writes, and a full read (a cleared table, a new database, many keys) never links.
- [The blocks clip what a row draws outside itself] → a block with a dragged, dropped-on, edited or expanded row draws normally, the block keeps `overflow-clip-margin`, and `make ui-check` covers the rows.
- [Screen readers lose the rows' list] → explicit `listitem` roles inside presentational blocks; the a11y-list check reads Chromium's accessibility tree of the 2,000-row list; the axe screen checks run on every list.
- [WebKit's skipped-row bug (release 0.22.0)] → blocks fall back to `content-visibility: visible` there, as rows did.
- [Memory] → a link holds the changed rows only, and goes with its list.
