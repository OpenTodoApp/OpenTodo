## MODIFIED Requirements

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
