# Design: the level of a drop

## D1. A gap, not a row edge

The bottom quarter of `C` and the top quarter of `E` are the same place on screen. Both are now one gap between two visible rows of a group (the dragged task and its subtasks left out): `above` and `below`. A drop there can land at any depth from `below.depth` (anything shallower would take `below` away from its parent) to `above.depth + 1` (a subtask of `above`). Depth `above.depth + 1` puts the task in `above` (first when `above`'s subtasks show right below it, else last); a smaller depth puts it after `above`'s ancestor at that depth, which is exactly the gap. At the top of a group the gap has only `below` and one depth.

## D2. Sideways from where the drag began

The depth is the dragged task's own depth plus one level per whole indent (1.5 rem, the row's indent step) the pointer has moved sideways since the press, within the gap's range. An absolute rule ("the left of the row means top level") would depend on where on the row the press began, and a press on the title is already two indents in. A relative rule means a plain vertical drag keeps the task's level, which is the issue's case (a top-level task stays top level below a deep subtree), and a deliberate move to the right nests it. A whole step (not half) keeps a slightly diagonal mouse from nesting by accident. Touch works the same way: the finger's sideways movement after the hold.

The issue proposed three zones across the row (left, middle, right). Zones across the row compete with the zones down the row (before, inside, after) and need three visual states; the line at the level is one visual state that already exists in the sidebar.

## D3. Feedback

The line keeps its look (a 2 px accent line with a dot at its start) and starts where the checkbox of a row at that depth would be, capped at the row's own cap of three levels, as the sidebar's project line starts at its level. Even at the top level the line starts at the checkbox, so two levels are never confused at the start of a row. Dropping on the middle of a row keeps its ring.

## D4. Without dragging

WCAG 2.5.7 is already met for nesting: Tab and Shift+Tab indent and outdent, the row menu's Reorder items move within the level, and the task's Parent field sets any parent from a pointer. The drag-alternatives map names the Parent field for the task row; its description now mentions the level.

## Interface budget

No chrome, row property, scroll region or shortcut is added; the indicator is the existing line.

## Data model

None. A drop is the same one `moveTask` write as before (a parent and a position), applied locally first, offline included, converging by last writer wins per field.

## Size

About 0.6 KB gzip in the list's drag code, which is in the entry with every list: the first load goes from 688.0 to 688.6 KB and the entry from 139.7 to 140.2 KB, so both budgets rise by 1 KB with the reason in `web/bundle-budget.json`. Loading the rule at the press would leave the first moves of a drag without a level.
