## MODIFIED Requirements

### Requirement: Create subtasks
The user SHALL be able to add a subtask from an "Add subtask" input in the parent's detail panel, by pressing `a` with a task selected in a list, by choosing Add subtask in the task's row menu in a project or the Inbox, and from a check-list line in the parent's notes with Make subtask (`rich-text-editing`). `a` SHALL open the add-subtask line under the selected row in the list layout of the Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels and places, however the row was selected (a click, `j`/`k`, the arrow keys) and whatever the task opening preference, since a click selects the row without editing its title (`task-list-presentation` "A click selects the row, a second click edits its title"); `a` typed while a title or another field is being edited SHALL stay text in that field. A new subtask SHALL inherit the parent's project, default to priority 4 and no due date, and SHALL appear beneath its parent immediately, including offline; one made from a checked line SHALL be created completed.

#### Scenario: Add from the detail panel
- **WHEN** the user types "Book hotel" in the "Add subtask" input of "Plan trip" and presses Enter
- **THEN** "Book hotel" appears indented under "Plan trip" in the same project and the input stays focused for the next entry

#### Scenario: Add from the keyboard offline
- **WHEN** the device is offline, "Plan trip" is selected and the user presses `a`, types a title and presses Enter
- **THEN** the subtask is shown under "Plan trip", survives a reload and is uploaded when the network returns

#### Scenario: Click, then a
- **WHEN** the user clicks the title of "Plan trip" in Today with a mouse on a 1280 px screen and presses `a`, with the task page preference, and again with the side panel, and again in a project and in the Inbox
- **THEN** each time the add-subtask line opens under "Plan trip", and the title of "Plan trip" is unchanged

#### Scenario: Typing in the title
- **WHEN** the user is editing the title of "Plan trip" in place and types `a`
- **THEN** the letter is added to the title and no add-subtask line opens

#### Scenario: Add from the row menu
- **WHEN** the user presses and holds "Plan trip" on a phone, chooses Add subtask, types "Book hotel" and sends it
- **THEN** "Book hotel" appears under "Plan trip" and the line stays open for the next subtask

#### Scenario: From a checked line
- **WHEN** the user chooses Make subtask on the checked line "Pack charger" in the notes of "Plan trip"
- **THEN** "Pack charger" appears under "Plan trip" as a completed subtask and the parent's progress counts it
