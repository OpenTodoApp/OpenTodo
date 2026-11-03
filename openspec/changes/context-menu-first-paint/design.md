## Context

`useRowMenu` mounts `BulkActionsMenu` when a row is right-clicked. `useBulkData` then starts a `useLiveQuery` for the ticked tasks; until it lands `tasks` is empty, so `bulkMenuGroups` builds the menu for no task: no group of the one task's own items, and `Popover` measures and shows that shorter panel. When the read lands the group appears above Complete, the panel's `ResizeObserver` measures it again and `place()` moves it (it flips above the pointer or shifts inside the viewport). The other reads the items depend on (labels, memberships, preferences, the review row) are shared snapshots that are normally loaded already, but they too can be missing on a first open.

## Decisions

### D1. Hold the panel until the items are final
`ActionMenu` takes `pending`: while it is set, the `Menu` is rendered closed (`open && !pending`), so the `Popover` mounts with the final items, measures once and fades in where it stays. `BulkActionsMenu` sets it until `useBulkData` reports `ready`: the task read for this selection has landed and labels, memberships, preferences and the review row are loaded. Rejected: reserving space (the item count depends on the task), and placing the panel only after a second layout pass (its first paint would still be the short list).

### D2. Only the first open waits
`ready` latches per mounted menu: a selection that changes while the Selection bar's menu is open does not close it (the read for the new selection keeps the earlier items until it lands, as before).

## Risks

- The menu appears a few milliseconds after the click (one local read). A key pressed in that window (Escape) reaches the page, not the menu.
- A read that never lands would keep the menu from opening; the same snapshots feed the lists themselves, so the app would already show nothing.
