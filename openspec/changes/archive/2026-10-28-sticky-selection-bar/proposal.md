## Why

The selection bar ("4 selected · Actions · Clear") sat at the top of the list and scrolled away with it, so after ticking tasks far down a long list the actions were out of sight until the user scrolled back up (issue #518).

## What Changes

- The selection bar stays in sight while the list scrolls: it is pinned just below the page's sticky header (at the top where the header does not stick, as the phone's day head), on project lists, the standard views, saved views, the New view page and the method lists.
- Moving the keyboard cursor keeps the selected row below the bar as well as below the header (the `keep-cursor-row-visible` rule now counts everything pinned in a stack at the top).

Not **BREAKING**: no data, no API, no setting.

## Out of scope

- A bottom-docked action bar or a different bar on phones.

## Roadmap

Fixes #518 for `bulk-actions` (ROADMAP section 1, bulk edit).

## Capabilities

### New Capabilities

### Modified Capabilities
- `bulk-actions`: the selection bar stays in sight while the list scrolls.

## Impact

- `web/src/app/bulk/BulkActions.tsx` (`SelectionBar`), new `web/src/app/bulk/useBelowStickyHeader.ts`, `web/src/app/task-list/revealRow.ts`. A few hundred bytes; no dependency.
