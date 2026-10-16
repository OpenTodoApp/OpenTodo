# Design

## Decision

The selection box is shown only when `showCheckbox || ticked` (the list passes `showCheckbox` when any row is ticked or touch Select mode is on, `web/src/app/TaskListView.tsx` and `bulk/useBulkList.tsx`). Without a selection in progress the box is `hidden` (not merely invisible), so it can never receive the click, and the round checkbox carries no hover or focus-within visibility rules.

## Alternatives

- **A separate gutter for the selection box, shown on hover.** Rejected: it either shifts the title or needs a permanent empty column on every row, and still puts a second target next to the circle.
- **Keep the hover swap but delay it.** Rejected: any delay still lands under a slow, deliberate click.

Selection stays discoverable through the keyboard help (<kbd>x</kbd>), the row's Actions menu and the Bulk actions guide.
