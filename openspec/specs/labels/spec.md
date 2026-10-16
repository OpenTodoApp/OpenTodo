# labels Specification

## Purpose
Defines labels as a cross-project vocabulary: the label entity, how tasks reference labels by id, label views and counts, rename and merge, and the convergence behavior of the task label array.

## Requirements

### Requirement: Label entity
A label SHALL have a name, a colour, a sort position, creation time and optional deletion time, and SHALL be created, edited and deleted as operations applied locally first so it works offline and converges under per-field last-writer-wins. On the creating device, names SHALL be unique per user ignoring case; a duplicate created concurrently on another device SHALL be kept and offered for merging rather than rejected.

#### Scenario: Create a label offline
- **WHEN** the device is offline and the user creates label "errand"
- **THEN** it appears in the sidebar at once with an assigned colour, survives a reload and reaches other devices when the network returns

#### Scenario: Duplicate name on one device
- **WHEN** the user tries to create "Errand" while "errand" exists
- **THEN** the creation is refused with a message pointing to the existing label

#### Scenario: Concurrent creation of the same name
- **WHEN** two devices each create "errand" offline and both sync
- **THEN** both labels exist on every device, shown with a duplicate marker, and a merge action is offered

### Requirement: Assign and unassign labels
A task's `labels` array SHALL hold label ids. The user SHALL add and remove labels from the task detail panel and from a picker opened with `L` on a selected task, with type-ahead that can create a missing label. Label chips SHALL appear on task rows in every view. Ids referring to deleted or not yet received labels SHALL be kept in the data but not displayed. Changes apply locally at once and work offline.

#### Scenario: Assign from the picker
- **WHEN** the user presses `L` on a selected task, types "err" and presses Enter
- **THEN** label "errand" is attached, its chip shows on the row immediately, and the picker stays open for further labels

#### Scenario: Create while assigning
- **WHEN** the user types a name that matches no label in the picker and presses Enter
- **THEN** a label with that name is created and attached in one step

#### Scenario: Unknown id is hidden, not dropped
- **WHEN** a task arrives with a label id this device has not received yet
- **THEN** no chip is shown for it, the id stays in the task's array, and the chip appears once the label arrives

### Requirement: Label views and counts
The sidebar SHALL show a collapsible "Labels" group at the same level as Projects, inside the sidebar's single scroller, listing non-deleted labels by position with their open-task counts, each opening a view of that label's open tasks across all projects grouped by project. `g l` and the group's "All" action SHALL open the labels overview. Views and counts SHALL be computed from local data and update live.

#### Scenario: Open a label view
- **WHEN** the user selects "errand" in the sidebar
- **THEN** a view lists every open task carrying "errand", grouped by project, with the count matching the sidebar

#### Scenario: Count updates live
- **WHEN** a task carrying "errand" is completed on another device and this device syncs
- **THEN** the "errand" count in the sidebar decreases without a reload

#### Scenario: Reachable under a long tree
- **WHEN** the user has forty projects
- **THEN** scrolling the sidebar's middle part reaches the Labels group, which does not scroll on its own

### Requirement: Rename, recolour and reorder
Renaming or recolouring a label SHALL be a single operation on the label and SHALL not modify any task, because tasks reference labels by id. The new name and colour SHALL appear on every chip, view and count immediately on this device and on other devices after sync. Labels SHALL be reorderable in the sidebar. These actions work offline; concurrent renames resolve to the newer one.

#### Scenario: Rename propagates
- **WHEN** the user renames "errand" to "errands" while 40 tasks carry it
- **THEN** all 40 rows show "errands", exactly one operation is queued, and no task operation is written

#### Scenario: Concurrent rename and assign
- **WHEN** device A renames a label offline while device B attaches it to a task offline, and both sync
- **THEN** the task shows the label with its new name on both devices

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
The user SHALL be able to merge a label into another: every non-deleted task carrying the source id SHALL then carry the target id instead (no duplicates), one operation per task, and the source SHALL be deleted. The target SHALL be chosen in a searchable picker and the merge confirmed in a dialog naming both labels and the task count. Merge SHALL be offered on duplicate-named labels and in every label's menu. It works offline and converges like any batch of operations.

#### Scenario: Merge duplicates
- **WHEN** the user merges "Errand" (2 tasks) into "errand" (3 tasks)
- **THEN** "errand" is carried by 5 tasks, "Errand" is deleted, and the sidebar shows a single "errand"

#### Scenario: Pick the target by typing
- **WHEN** the user chooses "Merge into…" on "Errand" and types "err"
- **THEN** the picker lists "errand" and other matching labels but never "Errand" itself, and choosing "errand" shows a confirmation naming both labels and the 2 tasks to rewrite

#### Scenario: Merge from the duplicate banner
- **WHEN** the labels overview shows the duplicate-name notice for "Errand" and "errand" and the user activates its "Merge…" action
- **THEN** the merge confirmation opens with one of the two as source and the other as target, and the user can swap them before confirming

### Requirement: Whole-array convergence of task labels
The `labels` array of a task SHALL be written as one value and SHALL converge under per-field last-writer-wins: when two devices write different arrays for the same task offline, every device SHALL end with the array written with the greater timestamp. The client SHALL read the task's current array immediately before each write so that sequential edits on one device never lose a label. The caveat SHALL be documented in the sync documentation.

#### Scenario: Sequential edits on one device
- **WHEN** the user adds "errand" and then "call" to the same task
- **THEN** the task carries both labels

#### Scenario: Concurrent additions on two devices
- **WHEN** device A adds "errand" and device B adds "call" to the same task offline, and both sync
- **THEN** every device shows the same single label, the one whose write has the greater timestamp, and the other label is absent on every device

### Requirement: Labels API and export
The API SHALL expose `/api/v1/labels` with list, get, create, patch and delete following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Task create and patch SHALL accept `labels` as an array of existing label ids. The export SHALL include a `labels` array with deleted labels.

#### Scenario: Create a label via the API
- **WHEN** a script POSTs `{"name":"errand"}` to `/api/v1/labels` with a bearer token
- **THEN** the response is 201 with the label including `id`, `color` and `position`, and devices receive it on their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates labels
- **THEN** the response is 401 `unauthorized`

#### Scenario: Unknown label id on a task
- **WHEN** a task patch sets `labels` to include an id that is not an existing, non-deleted label
- **THEN** the response is 400 `invalid_input` and the task is unchanged

### Requirement: Label picker ordering and search
The label picker opened from the task detail panel or with `L` SHALL follow the design-system picker rules. With an empty query it lists labels assigned recently on this device first, then frequently assigned labels, then the rest by position. Typing matches by word prefix or fuzzily, ignoring case and accents. Assigning or removing a label is still one operation on the task's `labels` array, so it works offline and converges as specified in "Whole-array convergence of task labels".

#### Scenario: Recently used label first
- **WHEN** the user assigned "errands" to one task and opens the label picker on another task
- **THEN** "errands" is listed first

#### Scenario: Offline assignment
- **WHEN** the device is offline and the user picks a label from the reordered list
- **THEN** the label is assigned locally at once and syncs when the device reconnects, converging with other devices' edits under last-writer-wins

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
