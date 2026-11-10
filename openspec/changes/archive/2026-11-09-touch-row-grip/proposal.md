# Touch rework: the row's grip takes selection so a hold can open the menu

## Why

`task-row-context-menu` (merged as #510) gave every pointer the row's actions menu through a touch hold, but on a phone the long press was still doing three jobs at once: it ticked the row, it fought the browser's word selection while the press armed, and the checkbox it raised sat where the completion circle is — the platform's native control picked its own size and offset, so the two boxes never lined up. One gesture cannot mean three things: while the row body's long press ticks, the body's hold can never be the menu's gesture on a phone.

## What Changes

- **The row's grip takes selection on touch.** A marker at the row's right edge (shown only where a coarse pointer is the primary one) becomes the touch gesture for choosing rows: a tap ticks it (or unticks it, entering and leaving Select mode with the usual haptic), a hold does the same without moving, and any movement drags — the grip is `touch-action: none` and `user-select: none`, so it never scrolls and never selects words. A drag on the grip lifts at once, carrying the ticked selection when the pressed row is ticked.
- **The row body's hold is the menu's gesture on every pointer.** The fine-pointer rule is dropped: holding a row still arms it and releasing without moving opens the actions menu at the finger on a phone as on a laptop. The row keeps its tap, its swipe and its drag, and a held row is unselectable on touch screens (the inline editor and other fields in a row still select their text), so a long press can only mean what the app decided.
- **The selection box is drawn by the app.** A styled `.row-tick` box fills the same 20 px control slot as the completion circle at the same size on every device, instead of taking whatever size and offset the browser gave the native control.

No new menu items, no new strings, no new shortcuts, no server or sync change: selection stays device state.

## Capabilities

### Modified Capabilities

- `bulk-actions`: touch selection moves from the row body's long press to the row's grip (tap, hold, immediate drag); the row body's press still arms through the hold interval with the drag lifting only on movement after it, but it never ticks; the selection box fills the row's control slot as a styled box so its alignment is identical on every device.
- `action-menus`: the touch hold opens the actions menu on every pointer, coarse included — since selection moved to the grip, the row body's long press is the menu's gesture and nothing else.

## Impact

- Web app: `web/src/app/TaskRow.tsx` (the `RowGrip` component, coarse pointers only, and the `onGripDown` / `onGripClick` props), `web/src/app/task-list/TaskListRow.tsx` (the `grip` and `gripTap` entries of the stable `RowActions`), `web/src/app/task-list/useListBindings.ts` (the grip's tick-and-select; the body hold no longer ticks), `web/src/app/task-list/useListDrag.ts` (`startDrag`'s grip mode), `web/src/app/TaskListView.tsx` (the body hold is the menu's), `web/src/lib/dnd.ts` (grip mode in `beginDrag`, the hold menu on every pointer, `finePointer()` removed), `web/src/index.css` (`.row-tick`, coarse-pointer `user-select: none` on rows with form controls exempt).
- Tests: `web/src/lib/dnd.test.ts` (the menu on a coarse pointer, the grip's three gestures), `web/src/app/rowSwipe.test.tsx` (grip hold and grip tap select; the body's hold never ticks), `web/src/app/task-row-contextmenu.test.tsx` (a phone's hold arms and opens the menu), `web/src/app/taskRow.test.tsx` (the grip renders only on coarse pointers).
- Docs: one sentence each in `docs/work-from-the-list.md` and `docs/keyboard.md`, a CHANGELOG entry; no help-screen changes.
- Out of scope: grip on board cards or compact rows, draggability changes, any server, API or sync change.
