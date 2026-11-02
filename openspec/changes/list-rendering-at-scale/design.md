# Design

## Context

- `performance-10k` (design D8) found: opening the 2,000-task project spends about 1.5 s in style and layout of every row (a passive effect that reads `scrollLeft` forces it before the first frame, but the browser would do it anyway); one completion or pulled edit re-reads the 10,000 tasks of the shared snapshot and re-renders much of the list (about 1.5 s of React work with style and layout); the cursor near the top looked for pinned headers among every element (fixed there).
- Trying Dexie's live-query cache (a plain `toArray()` instead of a `filter()` cursor, so Dexie can update the cached result in memory) cut a completion from 4.8 s to 1.5 s, but eleven unit tests saw stale lists after the database was deleted and opened again; it was left out of `performance-10k`.

## Decisions

**D1. `content-visibility: auto` on list rows, not windowing first.** It keeps every row in the DOM, so keyboard focus, `j`/`k`, find in page, drag and drop and assistive technology work as before, and it lets the browser skip layout and paint of rows far from the viewport. Each row declares `contain-intrinsic-size: auto <row height>` so the scrollbar stays stable, and `overflow-clip-margin` keeps the drop line (1 px outside the row) visible under the paint containment. Boards and cards are left alone.

**D2. The tasks snapshot applies changes.** `liveSnapshot` for tasks subscribes to Dexie's `storagemutated` event: when the changed parts name primary keys of `tasks` (up to 500), it reads them with one `bulkGet` and replaces, adds or removes those rows in a copy of the array; otherwise (an unknown range, a cleared table, more keys) it reads the table as today. The visible-task rule (`isTaskVisible`) runs on the changed rows only. Unit tests compare the patched snapshot with a full read after every kind of write.

**D3. The tick before the round trip.** The row keeps a local "completing" state set on click and cleared when the stored row agrees (or the write fails), so the tick paints in the frame of the click.

**D4. Windowing as a last resort**, in a later change, only if D1–D3 leave the list budgets unmet on the CI runner.

## Risks

- Paint containment clips what a row draws outside itself: checked on every row control and the drop line (`ui-check` visual regression covers the row stories).
- A patched snapshot that diverges from storage shows wrong data: the fallback to a full read on anything unexpected, and the equality tests.
