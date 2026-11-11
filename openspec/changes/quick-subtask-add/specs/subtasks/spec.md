# Spec Delta

## MODIFIED Requirements

### Requirement: Create subtasks
The user SHALL be able to add a subtask from an "Add subtask" input in the parent's detail panel, by pressing `a` with a task selected in a list, by choosing Add subtask in the task's row menu in a project or the Inbox, from the "Add a subtask" line at the end of the parent's visible subtasks in a list that shows them ("Add-subtask line in lists"), and from a check-list line in the parent's notes with Make subtask (`rich-text-editing`). A new subtask SHALL inherit the parent's project, default to priority 4 and no due date, and SHALL appear beneath its parent immediately, including offline; one made from a checked line SHALL be created completed.

#### Scenario: Add from the detail panel
- **WHEN** the user types "Book hotel" in the "Add subtask" input of "Plan trip" and presses Enter
- **THEN** "Book hotel" appears indented under "Plan trip" in the same project and the input stays focused for the next entry

#### Scenario: Add from the keyboard offline
- **WHEN** the device is offline, "Plan trip" is selected and the user presses `a`, types a title and presses Enter
- **THEN** the subtask is shown under "Plan trip", survives a reload and is uploaded when the network returns

#### Scenario: Add from the row menu
- **WHEN** the user presses and holds "Plan trip" on a phone, chooses Add subtask, types "Book hotel" and sends it
- **THEN** "Book hotel" appears under "Plan trip" and the line stays open for the next subtask

#### Scenario: Add from the list's add line
- **WHEN** "Plan trip" shows its subtasks in a project and the user types "Book hotel" in the "Add a subtask" line under them and presses Enter
- **THEN** "Book hotel" appears indented under "Plan trip", above the line, and the input stays focused for the next entry

#### Scenario: From a checked line
- **WHEN** the user chooses Make subtask on the checked line "Pack charger" in the notes of "Plan trip"
- **THEN** "Pack charger" appears under "Plan trip" as a completed subtask and the parent's progress counts it

## ADDED Requirements

### Requirement: Add-subtask line in lists
In a list that renders subtasks as indented rows — a project's or the Inbox's tree, and Today and Upcoming with Nest subtasks on (subtasks "Nested display in lists" and "Flat display in cross-project and date views") — a task with at least one visible subtask SHALL show an "Add a subtask" line at child indent directly after its last visible subtask. The line SHALL be muted until used: a ghost row that becomes the same input `a` opens when clicked or activated, and returns to the ghost on Escape or when it loses focus empty. A task with no visible subtask — childless, or with its subtasks folded — SHALL show no line, nor SHALL a completed task, a read-only task or a departing row, matching the row menu's own rules; a viewer of a shared project SHALL see no line. When several parents' visible subtasks end at the same row, each SHALL get its line at its own indent, innermost first. The line is not a task row: it does not count in progress or row positions, is not a `j`/`k` cursor stop, and writes through the same `createSubtask` ops as the other ways to add, so a subtask added from it appears offline at once and converges per field.

#### Scenario: Line under the last subtask
- **WHEN** "Plan trip" has subtasks "Flights" and "Hotel" in a project
- **THEN** a muted "Add a subtask" line shows indented under "Hotel", and clicking it opens the input focused

#### Scenario: First line, second entry
- **WHEN** the user adds "Insurance" from the line and the input stays open
- **THEN** typing "Parking" and pressing Enter adds it as the next subtask, above the line

#### Scenario: No subtask list, no line
- **WHEN** "Buy milk" has no subtasks, or "Plan trip"'s subtasks are folded
- **THEN** no "Add a subtask" line shows under either

#### Scenario: Read-only parent
- **WHEN** "Plan trip" is completed, or belongs to a project shared with the user as viewer
- **THEN** its subtasks list shows no "Add a subtask" line

#### Scenario: Stacked lines
- **WHEN** "Plan trip" ends with "Hotel", which ends with its own subtask "Compare prices"
- **THEN** the row after "Compare prices" shows Hotel's line, then "Plan trip"'s, each at its own indent

#### Scenario: Escape returns the ghost
- **WHEN** the input opened from the line is empty and the user presses Escape or clicks away
- **THEN** the muted line returns and nothing was written
