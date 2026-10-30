# Phone: checkbox hit area and filling the focus by touch

## Why

Two phone gaps reported after 0.17:

- Issue #636: on a phone a slightly off tap next to a task's circle opens the task instead of completing it. The circle's button is already 44 × 44 px on a coarse pointer, but the row's open control comes after it and wins the overlap as soon as it is painted on its own layer (the first-visit swipe hint, a swipe that is returning, a row animation), so the reachable target shrinks to about the circle.
- Issue #641: today's focus (Three tasks) and the Bento slots (`bento-daily-check`, #640) are filled only with the `f` key. On a phone there is no way to put a task in the focus, and an empty Bento slot is not a target.

## What Changes

- The task checkbox keeps its 20 px circle and its 44 × 44 px button on a coarse pointer, and the button is stacked above the row's other parts, so a tap up to 8 px outside the circle completes the task on every row that shows one (lists, Today, boards' cards, the Daily check, the Loop home). The layout check measures it.
- An empty Bento slot in the Daily check is a 44 px button that opens a task picker for that slot: today's and overdue open tasks first, tasks whose estimate fits the slot first within each group, then tasks without an estimate, then the rest; any open task can be found by typing.
- In Three tasks the Daily check always shows Today's focus, with an "Add to focus" row while it holds fewer than three tasks, which opens the same picker.
- The Loop home's Today's focus offers "Add to focus" while there is room.
- One task's Actions menu (the selection bar's menu on a phone, the right-click and More menus), the task panel's and task page's menu and the Focus screen's menu offer **Add to focus** (Three tasks) or **Put in a slot** (Bento), and **Remove from focus** when the task is in today's focus. The focus is personal, so viewers of a shared task have the items too.
- Every path uses the rules `f` uses (one module shared with the Daily check): Three tasks refuses a fourth; Bento places by estimate, refuses a taken slot with Choose a slot, and asks for a slot (with Set estimate… for an editable task) when there is no estimate. Every write is one batch with Undo, `f` in Three tasks included.

Not **BREAKING**: no new field, op, route or environment variable.

Out of scope: dragging tasks into slots, reordering the focus, a focus control on the Focus screen's task card, changing the Bento rules themselves.

ROADMAP: no item; fixes issues #636 and #641, shipping in 0.18.0.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `weekly-review`: ADDED "Filling the focus by touch".
- `task-list-presentation`: ADDED "Checkbox touch target".

## Impact

- Web: `web/src/app/TaskRow.tsx` (stacking of the checkbox slot), `web/src/lib/focusEdit.ts` (new: the shared press, place and estimate rules with Undo), `web/src/app/focus/focusRequest.tsx` (new: menu state, the menu item, the lazily loaded picker host), `web/src/app/focus/FocusPicker.tsx` (new, lazy), `DailyCheck`, `BentoSlots`, `LoopHome`, `FocusView`, `BulkActions`, `TaskActionsMenu`, `Shell`. Strings in the six catalogues.
- Checks: `scripts/ux-audit/measure.mjs` (`rowCheckReach`) run by `scripts/e2e-layout.mjs`.
- Docs: the Daily check and Focus guide pages.
- Data, sync, E2EE, server: none.
