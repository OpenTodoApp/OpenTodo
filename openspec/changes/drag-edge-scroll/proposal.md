## Why

GitHub issue 1760: on an iPhone (the installed web app and the iOS app), holding a task or a sidebar project and moving it either scrolls the whole list with the finger, so the row can only be dropped where it was, or the list stays still but never scrolls at its edge, so the row can't reach a place off screen.

## What Changes

- A held or lifted row keeps the page still under the finger on iOS too. The listener that stops the scroll is there before the touch starts, instead of being added by the press, which iOS WebKit ignores.
- A lifted drag scrolls the main list or the sidebar while the pointer rests near its top or bottom edge, faster nearer the edge, for touch, mouse and pen alike, and the drop line follows.

Every drag that goes through `lib/dnd` gets the edge scrolling, the calendar and timeline drags included, wherever their region is the main content. Out of scope: horizontal scrolling of board columns, and the lift itself (row-lift-overscroll). No ROADMAP item; this is a bug fix. No new environment variable, no op change.

## Capabilities

### Modified Capabilities

- `manual-ordering`: adds "A drag holds the page and scrolls at its edges".

## Impact

`web/src/lib/dnd.ts` and its test. No dependency.
