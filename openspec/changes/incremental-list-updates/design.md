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

**D1. Task lists note their changes.** `lib/taskDelta.ts`: `noteChanges(prev, next, changes)` links a list to the list it was made from with the changed rows (`{id, before, after}`); `changesBetween(from, to)` follows up to eight links and merges them, or returns null (not linked, too far, more than 1,000 rows). The links live in a `WeakMap` keyed by the newer list, so a list nothing holds goes with its link. The snapshot patches its visible sets with the same changes while the projects and workspaces are unchanged (`patchSets`: one sorted splice per changed row instead of filtering 10,000 rows) and notes them; an account with several workspaces derives its sets in full, since a task without a project takes its workspace from its parent. `Derived<V>` (and its per-list cache form) keeps a value from one list to the next: the same list gives the same value, a linked list gives `patch(previous value, changes)`, anything else or a patch that returns null gives `full`. Alternatives: a version counter per snapshot and a ring of deltas (kept lists alive by number, not by reference; the WeakMap needs no bookkeeping); immutable persistent collections (a dependency and a rewrite of every consumer).

**D2. What is derived from the tasks follows the changed rows.** Each derivation keeps its full form and gains a patch that handles the common changes exactly and returns null for the rest:

- per snapshot, shared by every consumer: the task index (a copied map with the changed entries), the open tasks (a sorted splice), open counts per project (plus and minus);
- progress: plus and minus per parent of a changed row;
- blockers: the same map when no changed row has or is a blocker; the changed rows and their dependents recounted when no `blocked_by` (or its clock) changed and no row came or went; otherwise in full (cycles are broken over the whole graph);
- habit streaks: the same map unless a changed row has a series, a habit or a split lineage;
- flows: a new `FlowState` keeps the worked-out sequence of every project no changed row belongs to, so asking it for 2,000 rows is a lookup each;
- a view's tasks: views whose membership is a test of the task alone (a project, a label, a place, assigned, Someday, Anytime, Today, Upcoming, Completed) remove the changed rows and insert the ones that pass at their place in the view's order (the order with the id last, which is what a stable sort of the id-ordered snapshot gives); the Inbox only when no changed row's placement or parent changed (a parent's placement moves its subtasks);
- a project's completed tasks by section: only when a changed row is in the project;
- the sidebar's Inbox, Today and assigned counts, open counts per project and per label, and the app badge: plus and minus per changed row, with the same conditions as their views.

The groups of a tree list are built from the view's own rows (its 2,000 tasks, not the account's 10,000), and `keepGroups` keeps every row and group that did not change, as before.

**D3. Rows compare only what a write changed.** A patched map notes the keys it may answer differently (`noteKeys`; `keysBetween` follows the links). The list's row renderer works out those keys once per drawing and a kept row looks up a renewed map only when its id is among them; a row that passes moves its cached context forward, so the next write starts from it. A map without a link (worked out in full) compares every row as before.

**D4. One list redraw per completion.** The departing row (the ghost the list keeps in place) follows its own departure (`useDeparture`) and draws nothing once it ends or Undo turns it into a restore; the list forgets the ghost when it next draws for another reason. The list no longer subscribes to the end of departures. The 400 ms moment, Undo and reduced motion behave as before.

**D5. Long lists skip blocks of rows.** A list of 100 rows or more (until it falls under 50) draws its rows in blocks (`rowBlocks`): a block of about 50 rows keeps its rows from one drawing to the next (a new row joins the block before it, a block that doubles is split), so a row that comes or goes moves no row to another block, which would draw it again. `content-visibility: auto` moves from each row to the block, with an intrinsic size of its rows at the row estimate; a block holding a row that must not be clipped (dragged, dropped on, edited, expanded) draws normally. The blocks are `li role="none"` around `ul role="none"`, and rows inside them say `role="listitem"`, so each row stays an item of its list in the accessibility tree (`scripts/perf/a11y-list.mjs` checks it on the 2,000-row list). Measured in the phone profile on the 2,000-row list: a frame's lifecycle 17.0 → 4.4 ms, intersection work 13.6 → 0.2 ms a frame, a hit test 2.4 → 1.0 ms. Alternatives: blocks by index (a row that leaves moves one row of every later block), `content-visibility: hidden` far away (hides rows from find in page and assistive technology), windowing (rejected in `list-rendering-at-scale` D4).

**D6. The equivalence test.** `incrementalEquivalence.test.ts` builds a seeded random account (projects, sections, subtasks, blockers, habits, sequential projects, dates) and applies random writes (create, edit, complete, reopen, move between projects, sections and parents, reschedule, defer, delete, restore, blockers), each step through the same link the snapshot notes; after every step it compares each incremental value with its full form on the same rows: the snapshot sets, the index, the open tasks and counts, progress, blockers, habits, the flow answers of every task, every view's tasks, the groups of the project and Today lists, Today's closed list fill, the completed tasks by section and the sidebar and badge counts.

## Measured

| Phone profile (local, five runs) | main (after #989) | this change |
| --- | --- | --- |
| complete-task per run | 344, 208, 224, 216, 248 | (filled in by task 5.1) |
| complete-task median (budget 200) | 224 | |

A first try of D1 (the snapshot's sets), D4 and D5 alone measured 112 ms (three phone runs: 72, 112, 112) and cursor moves 78 ms.

## Bundle size

`lib/taskDelta.ts` and the patches add a few KB before gzip to the entry chunk; `make bundle-budget` must stay within `web/bundle-budget.json` (task 5.2 records the numbers).

## Risks / Trade-offs

- [A patch that diverges from the full form shows wrong data] → each patch returns null for any change it does not follow exactly, the equivalence test compares them after random writes, and a full read (a cleared table, a new database, many keys) never links.
- [The blocks clip what a row draws outside itself] → a block with a dragged, dropped-on, edited or expanded row draws normally, the block keeps `overflow-clip-margin`, and `make ui-check` covers the rows.
- [Screen readers lose the rows' list] → explicit `listitem` roles inside presentational blocks; the a11y-list check reads Chromium's accessibility tree of the 2,000-row list; the axe screen checks run on every list.
- [WebKit's skipped-row bug (release 0.22.0)] → blocks fall back to `content-visibility: visible` there, as rows did.
- [Memory] → a link holds the changed rows only, and goes with its list.
