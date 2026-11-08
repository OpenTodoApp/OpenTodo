# Design: add a task below another

## D1. A menu item and a line in place, not a draggable add button

Dragging the add button would answer the issue literally, but:

- The add button exists only below 768 px; a desktop list has no button to drag.
- It would need a second gesture on the button (a tap opens the sheet, a hold then a move drags), auto-scrolling a long list under the finger, and a drop rule for a task that does not exist yet.
- Every drag needs a way without dragging (WCAG 2.5.7). That way would be a row menu item anyway.

So the menu item is the feature, on every device: press and hold (or right-click) the task the new one should follow, choose **Add task below**, type. The line appears exactly where the task will land, which is the feedback the issue asked of the drag. **Add subtask** is the issue's second case (a drop on a task) and reuses the line `a` opens.

## D2. The line follows what it added

Each entry is created in the anchor's project, parent and section, then placed right after the last task the line added (the first time, after the anchor), like quick add's `o` insertion. The line is drawn after that task's row (and its visible subtasks), so it moves down after every add and the next task lands under the previous one. Until the new task is listed, the line stays where it was instead of jumping back. When the line moves, the new line takes the focus; the old one does not close the state on its way out (it closes only when focus left every add line).

## D3. Where it is offered

Only in a list that shows the tree and is ordered by hand (a project the user can edit, the Inbox), for one task that can move (not completed, not a viewer's): the same condition as the Reorder items. A label page or saved view with its own order has no parent to inherit and no tree, so the items are absent there.

## D4. Opening from a menu

The menu gives focus back to the row as it closes. The items open the line on the next frame, so the line keeps the focus it takes.

## Interface budget

No chrome: two items in the row menu's group with Reorder and the moves; the line is the existing inline add line. No new shortcut (Add subtask shows `a`), no scroll region, no row property.

## Data model

None. A new task is the same local create as every quick add, then the same position write as a move, so it works offline and converges like both.

## Size

About 0.9 KB gzip on the first load (689.5 KB, measured): the items, the list state and where the line is drawn load with every list; the line and its write (`SiblingInput`, `lib/createAfter.ts`) load when it first opens. The budget rises to 690 KB with the reason in `web/bundle-budget.json`.
