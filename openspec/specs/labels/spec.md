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
The sidebar SHALL show a collapsible "Labels" group listing non-deleted labels by position with their open-task counts, each opening a view of that label's open tasks across all projects grouped by project. `g l` SHALL open the labels overview. Views and counts SHALL be computed from local data and update live.

#### Scenario: Open a label view
- **WHEN** the user selects "errand" in the sidebar
- **THEN** a view lists every open task carrying "errand", grouped by project, with the count matching the sidebar

#### Scenario: Count updates live
- **WHEN** a task carrying "errand" is completed on another device and this device syncs
- **THEN** the "errand" count in the sidebar decreases without a reload

### Requirement: Rename, recolour and reorder
Renaming or recolouring a label SHALL be a single operation on the label and SHALL not modify any task, because tasks reference labels by id. The new name and colour SHALL appear on every chip, view and count immediately on this device and on other devices after sync. Labels SHALL be reorderable in the sidebar. These actions work offline; concurrent renames resolve to the newer one.

#### Scenario: Rename propagates
- **WHEN** the user renames "errand" to "errands" while 40 tasks carry it
- **THEN** all 40 rows show "errands", exactly one operation is queued, and no task operation is written

#### Scenario: Concurrent rename and assign
- **WHEN** device A renames a label offline while device B attaches it to a task offline, and both sync
- **THEN** the task shows the label with its new name on both devices

### Requirement: Delete a label
Deleting a label SHALL set its deletion time and SHALL remove its id from every non-deleted task that carries it, one operation per task. Deleted labels SHALL be hidden from the sidebar, pickers and chips, remain in the export, and an id of a deleted label that is re-added concurrently by another device SHALL stay hidden.

#### Scenario: Delete with usages
- **WHEN** the user confirms deletion of "errand", which 3 tasks carry
- **THEN** the label leaves the sidebar and no row shows the chip, on this device now and on others after sync

#### Scenario: Concurrent delete and assign
- **WHEN** device A deletes "errand" offline while device B attaches it to a task offline, and both sync
- **THEN** the label is deleted on both devices, the task's array may still contain the id, and no chip is shown

### Requirement: Merge labels
The user SHALL be able to merge a label into another: every non-deleted task carrying the source id SHALL be rewritten to carry the target id instead (without duplicates), one operation per task, and the source SHALL then be deleted. The action SHALL be offered on duplicate-named labels and available from any label's menu. It works offline and converges like any batch of operations.

#### Scenario: Merge duplicates
- **WHEN** the user merges "Errand" (2 tasks) into "errand" (3 tasks)
- **THEN** "errand" is carried by 5 tasks, "Errand" is deleted, and the sidebar shows a single "errand"

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
