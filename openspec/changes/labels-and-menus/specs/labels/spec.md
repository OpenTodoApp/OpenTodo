# Spec Delta

## MODIFIED Requirements

### Requirement: Delete a label
Deleting a label SHALL require confirming a dialog that states how many tasks carry it, SHALL set its deletion time and SHALL remove its id from every non-deleted task that carries it, one operation per task. Deleted labels SHALL be hidden from the sidebar, pickers and chips, remain in the export, and an id of a deleted label that is re-added concurrently by another device SHALL stay hidden.

#### Scenario: Delete with usages
- **WHEN** the user confirms deletion of "errand", which 3 tasks carry
- **THEN** the label leaves the sidebar and no row shows the chip, on this device now and on others after sync

#### Scenario: Confirmation states the impact
- **WHEN** the user chooses "Delete" in the menu of "errand", which 3 non-deleted tasks carry
- **THEN** a dialog says the label will be removed from 3 tasks and nothing changes until "Delete label" is pressed

#### Scenario: Concurrent delete and assign
- **WHEN** device A deletes "errand" offline while device B attaches it to a task offline, and both sync
- **THEN** the label is deleted on both devices, the task's array may still contain the id, and no chip is shown

### Requirement: Merge labels
The user SHALL be able to merge a label into another: every non-deleted task carrying the source id SHALL be rewritten to carry the target id instead (without duplicates), one operation per task, and the source SHALL then be deleted. The target SHALL be chosen in a searchable picker and the merge confirmed in a dialog stating both labels and the task count. The action SHALL be offered on duplicate-named labels and available from any label's menu. It works offline and converges like any batch of operations.

#### Scenario: Merge duplicates
- **WHEN** the user merges "Errand" (2 tasks) into "errand" (3 tasks)
- **THEN** "errand" is carried by 5 tasks, "Errand" is deleted, and the sidebar shows a single "errand"

#### Scenario: Pick the target by typing
- **WHEN** the user chooses "Merge into…" on "Errand" and types "err"
- **THEN** the picker lists "errand" and other matching labels but never "Errand" itself, and choosing "errand" shows a confirmation naming both labels and the 2 tasks to rewrite

#### Scenario: Merge from the duplicate banner
- **WHEN** the labels overview shows the duplicate-name notice for "Errand" and "errand" and the user activates its "Merge…" action
- **THEN** the merge confirmation opens with one of the two as source and the other as target, and the user can swap them before confirming

## ADDED Requirements

### Requirement: Labels overview page
The labels overview (`g l`) SHALL list every non-deleted label by position as a row with its colour, name, open-task count and a duplicate badge when another label shares its name, plus a "New label" action. With no labels it SHALL show an empty state explaining labels and how to create one. The page SHALL update live from local data and work offline.

#### Scenario: Rows and counts
- **WHEN** the user opens the labels overview with "errand" (3 open tasks) and "home" (none)
- **THEN** both rows show their colour and name, "errand" shows 3, and selecting a row opens that label's view

#### Scenario: Empty state
- **WHEN** the user has no labels and opens the overview
- **THEN** an empty state explains what labels are, shows a "New label" button, and mentions the `L` shortcut on a task

### Requirement: Label edit panel
Each label SHALL have an edit panel, opened from its row menu or by pressing Enter on a row's edit action, showing the name field, the colour palette of the design system with the current colour marked, reorder actions, and a separated danger zone with merge and delete. Name and colour changes SHALL apply as single label operations without a save button.

#### Scenario: Recolour from the panel
- **WHEN** the user opens the edit panel of "errand" and picks the teal swatch
- **THEN** the swatch is marked as selected, every chip of "errand" turns teal at once and exactly one label operation is queued

#### Scenario: Rename from the panel
- **WHEN** the user changes the name field to "errands" and presses Enter or moves focus away
- **THEN** the label is renamed with one operation; an empty name or a name already used by another label is refused with an inline message and the old name kept

#### Scenario: Panel on a phone
- **WHEN** a user on a 360 px wide screen opens the edit panel
- **THEN** it opens as a bottom sheet with its title and close control visible and every swatch at least 44×44 px

### Requirement: Inline rename of a label row
A label row SHALL switch to an inline name field on double-click, on F2 while the row is focused, or from the "Rename" menu item. Enter or leaving the field SHALL save, Escape SHALL cancel, and the same validation as the edit panel SHALL apply.

#### Scenario: Rename with F2
- **WHEN** a label row has focus and the user presses F2, types "errands" and presses Enter
- **THEN** the label is renamed with one operation and focus returns to the row

### Requirement: Reorder labels by drag and by keyboard
Labels SHALL be reorderable in the overview and in the sidebar by dragging a row and by pressing Alt+Up or Alt+Down (with Shift, to the top or bottom) on a focused row, as well as from the menu. A move SHALL write the moved label's position, and other labels' positions only when no gap is left between its new neighbours; it SHALL apply locally at once, work offline, and converge on other devices; concurrent moves resolve by last writer.

#### Scenario: Keyboard reorder
- **WHEN** "home" is second and the user presses Alt+Up on its focused row
- **THEN** "home" becomes first in the overview and the sidebar, focus stays on it, and a single label operation is queued for "home"

#### Scenario: Drag reorder offline
- **WHEN** the device is offline and the user drags "errand" below "work"
- **THEN** the new order shows at once and is uploaded when the network returns, and other devices show the same order after sync
