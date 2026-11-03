# Design

## Context

- `performance-10k` (design D8) found: opening the 2,000-task project spends about 1.5 s in style and layout of every row (a passive effect that reads `scrollLeft` forces it before the first frame, but the browser would do it anyway); one completion or pulled edit re-reads the 10,000 tasks of the shared snapshot and re-renders much of the list (about 1.5 s of React work with style and layout); the cursor near the top looked for pinned headers among every element (fixed there).
- A first try of D1 on the development machine (`.row-pad` with `content-visibility: auto`, one desktop run): opening the project 1,520 → 834 ms, a cursor move 230 → 57 ms (p95), a completion 3.1 → 2.6 s; the writes need D2 and D3.
- Trying Dexie's live-query cache (a plain `toArray()` instead of a `filter()` cursor, so Dexie can update the cached result in memory) cut a completion from 4.8 s to 1.5 s, but eleven unit tests saw stale lists after the database was deleted and opened again; it was left out of `performance-10k`.

## Decisions

**D1. Rows off screen cost nothing, and a long list draws its top first.** Two parts, neither of which takes a row out of the document for good:

- **`content-visibility: auto`** on list rows (`.row-offscreen`, not cards): the browser skips layout and paint of rows far from the viewport, while every row stays in the DOM, so keyboard focus, `j`/`k`, find in page, drag and drop and assistive technology work as before. `contain-intrinsic-size: auto 2.25rem` keeps the scrollbar stable and `overflow-clip-margin` keeps focus rings drawn. The row under the cursor, a dragged or dropped-on row, a row edited in place and an expanded row draw normally, so nothing they show beyond the row is clipped.
- **Progressive mounting** (`useRowLimit` in `ListGroups`): a list of more than 150 rows renders its first 150 in the first commit and 150 more in each idle callback, so a 2,000-row project shows its top in one frame and has every row in the document a few frames later. The row the cursor is on is drawn at once even if it lies further down. This is the "windowing" the proposal kept in reserve, without its costs: nothing is ever taken out again, so focus, find in page and drag and drop only ever wait for the first fraction of a second after opening a list.
- **Sibling positions written by the list** (`SiblingAria`): `aria-posinset` and `aria-setsize` of a tree list changed for every row when one row left, which as React props re-rendered all 2,000 rows; the list now writes the same attributes on the rows when the positions change. Rows keep `aria-level`. Screen readers read the same attributes as before.

Windowing proper (rows outside the viewport removed from the DOM) was not needed and is not done.

**D2. The tasks snapshot applies changes.** `lib/taskSnapshot.ts` keeps every stored task (sorted by id) and listens to Dexie's `storagemutated` event: when the changed primary keys of `tasks` are named one by one (up to 1,000), it reads them with one `bulkGet` and replaces, adds or removes those rows in a copy of the array; anything else (a range, a cleared table, a new database, more keys) reads the table again. Rows a write did not touch keep their objects, so memoised rows and derived lists see no change. The projects and workspace state stay one live query. During a long pull the changes are noted and applied after 2, 4, 8, 16 s, as for the other snapshots. Dexie's own live-query cache was tried instead and dropped: under load, eleven tests saw stale lists.

Two places had relied on the old snapshot arriving late, and are fixed so that they hold whatever the timing: the triage card claims the task it is deciding before the write (it was dropped from the queue by the faster update, so the card skipped a task), and the Calendar's and Upcoming's query filter draws no task until the stored query is read (it drew every task for a moment).

**D3. The tick before the round trip.** `lib/pendingDone.ts`: completing a task (a click or a key in the list) records the wanted state for that row; the row draws it at once and stops as soon as its stored data changes (its field clocks object is new) or after 10 s, so a failed write shows the stored state again and a series that moved on shows its next occurrence.

**D4. Windowing as a last resort**, in a later change, only if D1–D3 leave the list budgets unmet on the CI runner.

**D5. Nothing outside a write's own rows moves.** Measured after D1–D3, a cursor move, a tick and a remote edit still made all 2,000 rows again, and each sync derived the 10,000 tasks again:

- The list keeps each row's element while nothing that row shows changed (`useRowRenderer`): the list-wide inputs are compared once, and each row compares its own answers (cursor, tick, editing, expanded, drop line, departure). React passes the kept elements over without comparing their props.
- Every exchange stored the workspace directory again, which woke every live read of the workspace state: the task snapshot derived its sets again and projects and labels came back as new objects, so every row's project and labels changed. The directory is now written only when it differs, the snapshot derives its sets only when a project's place, its Trash state or the workspaces change, and the project, label, view and membership snapshots keep unchanged rows as the same objects (`keepRows`).
- The sidebar's saved-view and workspace counts are computed after the write's own frame (`useDeferredValue`).
- The cursor's scroll looks for sticky headers without walking into rows, and the tab title keeps the heading it found instead of looking it up on every frame.
- The benchmark's remote edit compared the page's monotonic clock with the sender's wall clock, 0.9 s apart by then; both are wall-clock times now.

## Risks

- Paint containment clips what a row draws outside itself: checked on every row control and the drop line (`ui-check` visual regression covers the row stories).
- A patched snapshot that diverges from storage shows wrong data: the fallback to a full read on anything unexpected, and the equality tests.
