## Why

Moving up a long task list with the arrow keys (or `k`) put the selected row behind the sticky page header, so nobody could see which task was selected, and at the first task the list stopped short of the top, keeping the header's area and quick add out of view (issue #514). The list scrolled with `scrollIntoView({block: 'nearest'})`, which brings a row to the scroller's edge without knowing what is pinned there.

## What Changes

- The row under the keyboard cursor is kept fully visible below whatever is pinned at the top of the list (the page header, a group header) and above the bottom edge, in project lists, the standard views, saved views and the New view page.
- Moving to the first row scrolls the list all the way to the top.

Not **BREAKING**: no data, no API, no setting.

## Out of scope

- Other keyboard-driven lists (the calendar, the activity feed, the board) keep their own scrolling.

## Roadmap

Fixes #514 for `web-app` (ROADMAP section 1, keyboard navigation).

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-app`: the keyboard cursor's row stays in sight.

## Impact

- New `web/src/app/task-list/revealRow.ts`, used by `useListBindings.ts`, `FilterView.tsx` and `SavedViewView.tsx`. A few hundred bytes in the list chunk; no dependency.
