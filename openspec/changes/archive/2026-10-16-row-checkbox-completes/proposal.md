# Proposal

## Why

Since 0.5.0 the selection checkbox takes the place of a task's round checkbox whenever the pointer is over the row or the row has keyboard focus (`task-list-presentation` "Bulk selection does not shift rows", `bulk-actions` "Select with a pointer or on touch"). The circle a person aims at to complete a task is swapped for a selection box at the moment they click, so the click ticks the task for bulk actions instead of completing it. Completing is the most frequent action in the app; selecting is rare. Reported by the maintainer as "terrible UI/UX".

## What Changes

- The round checkbox always completes the task. Hover and keyboard focus never replace it.
- The selection checkbox appears in its place only while a selection is in progress: when at least one row is ticked, or in touch Select mode. Rows still never shift.
- Starting a selection with a pointer is `Ctrl`/`⌘`+click (one task) or Shift+click (a range) on a row, as before; with the keyboard <kbd>x</kbd>; on touch the Select button. Once one row is ticked, every row shows its selection box until the selection is cleared.
- Docs: `docs/bulk-actions.md` describes the new way in.

Nothing is **BREAKING**: no data, API or sync change.

## Capabilities

### Modified Capabilities
- `bulk-actions`: "Select with a pointer or on touch" no longer shows the box on hover or on the cursor row.
- `task-list-presentation`: "Bulk selection does not shift rows" swaps the boxes only while a selection is in progress.

## Impact

- `web/src/app/TaskRow.tsx` (two class lists), a regression test in `web/src/app/taskRow.test.tsx`, `docs/bulk-actions.md`. No bundle size change.
