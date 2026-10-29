# Design

## Context

See proposal.md for the motivation. What shapes the approach: the app already has three
gestures that want the same row — the drag's long-press (`lib/dnd.ts`, used by every
draggable list, board, calendar and the timeline), bulk-actions' "a long press ticks the
row" on phones, and now the pointer's own context gesture. The menu itself already exists
(the bulk-actions machinery behind `BulkActionsMenu`), so this change only decides who
opens it, where, and what must never be taken away from the browser.

## Decisions

### D1: One hold, one owner per row

`trackHold(e, { onArmed, onEnd })` in `lib/dnd.ts` is the single implementation of the
hold: the `TOUCH_HOLD_MS` timer, the armed latch, the once-only `onArmed`/`onEnd`
pair, the scroll block while armed, and the teardown. It deliberately does **not** own
movement or release — those mean different things to the two owners, so each decides:

| Owner | Rows | Movement while armed | Release while armed |
| --- | --- | --- | --- |
| `beginDrag` | any draggable row | lifts the drag (ghost appears) | a drop, or — fine pointer only — the menu at the finger |
| `holdForRow` | rows with no drag | ends the hold (a scroll) | the menu at the finger |

Exactly one owner exists per row: `holdForRow` returns as soon as the row passed a drag
handler, so the two never race for the same press.

### D2: What a long press means, per pointer

The rule is chosen so that one gesture never means two things *on the same device*:

- **Coarse pointer (a phone):** the hold never opens the menu. It keeps bulk-actions'
  meaning — it ticks the row where the list ticks one, otherwise it does nothing — and
  Chrome on Android's native long-press `contextmenu` is suppressed without opening
  anything, so a press cannot both tick and open. Touch users reach the menu through the
  row's own menu button, as before.
- **Fine pointer (mouse, trackpad, precise pen, a touchscreen laptop):** right-click, or
  a touch hold's release, opens the menu at the pointer.

`finePointer()` (`lib/dnd.ts`) answers the question once for both owners; it is the same
`(pointer: fine)` media query the list already uses to decide whether a long press selects.

### D3: The browser keeps its menu where it matters

Both contextmenu handlers run `nativeMenuWins(e)` first and return **without**
`preventDefault()` when the target is a link, a field, editable text, or when the row has
a non-collapsed selection — paste, spellcheck, "open in new tab" and "copy" must keep
working inside a row. Only then is the browser menu suppressed, and only then does the
menu open; a touch-originated `contextmenu` is suppressed but never opens the app's menu
(the hold owns touch).

### D4: One menu, one rule, focus back to the row

`useRowMenu(ticked, order)` (`app/bulk/useRowMenu.tsx`) owns the state, the selection
rule (`rowMenuIds`, which returns the ticked ids **in list order** so the review step
lists tasks identically from every entry point), the rendered element and the focus
restore. `TaskListView` and `useBulkList` both render `rowMenu.element` and call
`rowMenu.open(task, x, y, row)`; neither keeps its own copy of any of that. The row
element is captured when the menu opens and, on close, is given focus back only if the
focus ended up nowhere (on `<body>`) — a click that closed the menu keeps its own target.

The keyboard's `.` is intentionally *not* this rule: it acts on the whole ticked
selection wherever the cursor is (`list.actions`), and the comment and requirement say so.

## Out of scope

Runtime plugin-style loading of menus, a menu for rows outside task lists, timeline rows
(`TimelineView` renders bars, not `TaskRow`), and any change to what a phone's long press
does beyond never opening the menu.
