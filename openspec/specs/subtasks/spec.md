# subtasks Specification

## Purpose
Defines nested subtasks: how a task references its parent, how trees are shown and navigated, how parent progress and completion behave, and how concurrent re-parenting converges without manual conflict resolution.

## Requirements

### Requirement: Parent task reference
A task MAY reference a parent task through the existing `parent_id` field, to any depth. A subtask SHALL belong to the same project as its parent; changing a parent's project SHALL change the project of every descendant, one operation per task. Parent changes SHALL apply locally first, work offline and converge under per-field last-writer-wins. A task whose parent is missing locally, deleted or completed SHALL be displayed at the top level of its project without any write.

#### Scenario: Subtree follows the parent to a new project
- **WHEN** "Plan trip" with subtasks "Flights" and "Hotel" is moved from "Personal" to "Travel"
- **THEN** all three tasks are listed in "Travel" and none remain in "Personal", on this device now and on others after sync

#### Scenario: Parent not yet received
- **WHEN** a device receives a subtask's operations before its parent's operations
- **THEN** the subtask is shown at the top level of its project until the parent arrives, then nests beneath it, with no operation written

### Requirement: Create subtasks
The user SHALL be able to add a subtask from an "Add subtask" input in the parent's detail panel, by pressing `a` with a task selected in a list, and from a check-list line in the parent's notes with Make subtask (`rich-text-editing`). A new subtask SHALL inherit the parent's project, default to priority 4 and no due date, and SHALL appear beneath its parent immediately, including offline; one made from a checked line SHALL be created completed.

#### Scenario: Add from the detail panel
- **WHEN** the user types "Book hotel" in the "Add subtask" input of "Plan trip" and presses Enter
- **THEN** "Book hotel" appears indented under "Plan trip" in the same project and the input stays focused for the next entry

#### Scenario: Add from the keyboard offline
- **WHEN** the device is offline, "Plan trip" is selected and the user presses `a`, types a title and presses Enter
- **THEN** the subtask is shown under "Plan trip", survives a reload and is uploaded when the network returns

#### Scenario: From a checked line
- **WHEN** the user chooses Make subtask on the checked line "Pack charger" in the notes of "Plan trip"
- **THEN** "Pack charger" appears under "Plan trip" as a completed subtask and the parent's progress counts it

### Requirement: Nested display in lists
Project and Inbox views SHALL render subtasks indented beneath their parent, ordered by position within each level, with a per-device collapse toggle in the row's leading slot on parents (Left collapses, Right expands on the selected row). Every list SHALL reserve the same leading slot, so checkboxes align across tree and flat views.

#### Scenario: Indented tree
- **WHEN** "Plan trip" has subtasks "Flights" and "Hotel", and "Hotel" has subtask "Compare prices"
- **THEN** the project view shows "Plan trip", then "Flights" and "Hotel" indented one level, then "Compare prices" indented two levels

#### Scenario: Aligned across views
- **WHEN** the user switches from Today to the Inbox
- **THEN** the checkboxes of top-level tasks sit at the same horizontal position in both

### Requirement: Flat display in cross-project and date views
Views that span projects or filter by date SHALL list each matching task once, flat, with a breadcrumb naming its parent; a parent that does not itself match SHALL not be shown.

#### Scenario: Flat in Today
- **WHEN** only "Compare prices" is due today
- **THEN** Today lists "Compare prices" once with a breadcrumb "Hotel" and does not list "Plan trip" or "Hotel"

### Requirement: Parent progress
A task with at least one non-deleted subtask SHALL show its progress as "completed/total" over its direct subtasks in list rows and in the detail panel, computed from local data so it is correct offline and updates live when a subtask changes on any device.

#### Scenario: Progress indicator
- **WHEN** "Plan trip" has five direct subtasks of which three are completed
- **THEN** its row shows "3/5"

#### Scenario: Remote completion updates progress
- **WHEN** another device completes a fourth subtask and this device syncs
- **THEN** the row shows "4/5" without a page reload

### Requirement: Completing a parent
Completing a parent SHALL also complete every open descendant, one completion operation per task, so the result converges on every device. Reopening a parent SHALL reopen only the parent. Completing the last open subtask SHALL not complete the parent automatically but SHALL offer a one-key action to complete it. Under concurrent edits, a subtask added to a parent that was completed on another device SHALL remain open and SHALL be displayed at the top level of its project.

#### Scenario: Complete the parent
- **WHEN** the user completes "Plan trip" while two of its subtasks are open
- **THEN** "Plan trip" and both subtasks gain a completion time and appear in Completed

#### Scenario: Last subtask completed
- **WHEN** the user completes the only remaining open subtask of "Plan trip"
- **THEN** "Plan trip" stays open showing "5/5" and a prompt offers to complete it with Enter

#### Scenario: Concurrent complete and add
- **WHEN** device A completes "Plan trip" offline while device B adds subtask "Insurance" under it offline, and both sync
- **THEN** "Plan trip" is completed, "Insurance" is open and listed at the top level of the project with a breadcrumb, on both devices

### Requirement: Move between parents
The user SHALL be able to change a task's parent with Tab (indent under the previous visible sibling), Shift+Tab (outdent to the grandparent or top level) and a "Parent task" picker in the detail panel that excludes the task itself, its descendants, completed and deleted tasks, and tasks of other projects. A move SHALL place the task last among its new siblings, apply locally at once, work offline and converge.

#### Scenario: Indent with Tab
- **WHEN** "Hotel" is selected directly below its sibling "Flights" and the user presses Tab
- **THEN** "Hotel" becomes the last subtask of "Flights"

#### Scenario: Outdent with Shift+Tab
- **WHEN** "Compare prices" (under "Hotel", under "Plan trip") is selected and the user presses Shift+Tab
- **THEN** "Compare prices" becomes the last subtask of "Plan trip"

#### Scenario: Picker excludes descendants
- **WHEN** the user opens the "Parent task" picker on "Plan trip"
- **THEN** "Flights", "Hotel" and "Compare prices" are not offered and "No parent" is

### Requirement: Cycle prevention for subtasks
A task SHALL never be displayed as its own ancestor. The client SHALL refuse a parent that is the task itself or a descendant; the REST API SHALL reject such a patch and a parent in another project with `invalid_input`. When concurrent moves on two devices still produce a cycle after sync, every device SHALL break it identically: the member whose parent field has the newest last-writer-wins clock is shown at the top level, no operation is written, and the user may move it again.

#### Scenario: API rejects a cycle
- **WHEN** an authenticated client patches "Plan trip" with `parent_id` set to its subtask "Hotel"
- **THEN** the response is 400 `invalid_input` and the parent is unchanged

#### Scenario: API requires authentication
- **WHEN** a request without credentials patches a task's `parent_id`
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Concurrent moves form a cycle
- **WHEN** device A makes "X" a subtask of "Y" offline while device B makes "Y" a subtask of "X" offline, and both sync
- **THEN** both devices show the task whose parent change has the newer clock at the top level with the other nested beneath it, and both remain reachable

### Requirement: Deleting a parent
Deleting a task SHALL also soft-delete every descendant, one tombstone operation per task, so the whole subtree stays deleted on every device after sync and remains in the export. A subtask deleted on one device while edited on another SHALL stay deleted.

#### Scenario: Delete a subtree
- **WHEN** the user deletes "Plan trip", which has three descendants
- **THEN** all four tasks gain a deletion time, disappear from every view and are present in the export with `deleted_at`

#### Scenario: Concurrent delete and edit
- **WHEN** device A deletes "Plan trip" offline while device B renames its subtask "Hotel" offline, and both sync
- **THEN** "Hotel" is deleted on both devices and carries the new title in the export

### Requirement: Paste several subtasks
Pasting text with at least two non-empty lines into an empty "Add subtask" field SHALL offer "Add N subtasks" and "Paste as one line", with the same line cleanup, preview, Escape behaviour and limit of 100 lines as a paste into quick add (`natural-language-capture`). Confirming SHALL create one subtask per line under the task, in the pasted order, each inheriting the parent's project with priority 4 and no due date, without parsing the line. The subtasks SHALL be written as one batch applied locally first, so they appear at once offline, upload together and converge like subtasks added one by one, and one Undo SHALL remove them all. The field SHALL keep the focus afterwards.

#### Scenario: Paste a packing list
- **WHEN** the user pastes "1. Passport\n2. Charger\n3. Tickets" into the Add subtask field of "Plan trip" and confirms
- **THEN** "Passport", "Charger" and "Tickets" appear in that order under "Plan trip", the parent's progress counts three open subtasks, and the field stays focused

#### Scenario: Subtask lines are not parsed
- **WHEN** the user pastes "Pack tomorrow\nBook taxi p1" into the Add subtask field and confirms
- **THEN** two subtasks are created with the titles "Pack tomorrow" and "Book taxi p1", with no due date and priority 4

#### Scenario: Offline subtasks
- **WHEN** the device is offline and the user pastes and confirms three lines in the Add subtask field
- **THEN** the three subtasks are shown under the parent at once, survive a reload and upload together when the network returns
