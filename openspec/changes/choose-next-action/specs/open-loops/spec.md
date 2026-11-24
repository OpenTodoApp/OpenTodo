## ADDED Requirements

### Requirement: Choosing a next action among a project's open tasks
The next-action field of Place on the Loop home, and quick add opened from the weekly review's project walk (`q` or "Add a next action"), SHALL offer the project's open top-level tasks that are neither the current next action, nor blocked, nor assigned to someone else. While the field has focus, typing two or more characters SHALL list those whose name contains what was typed (case, accents and spaces at the ends ignored), in the project's list order, at most eight; ↓ in a field with fewer characters SHALL list them all, up to eight. No task SHALL be chosen until an arrow key moves into the list (hovering only highlights), so Enter SHALL still add what was typed as a new task. Enter on a chosen task, or a click, SHALL make it the next action instead of adding a task: in one edit it leaves Someday or a later start, and when another open task comes first in the project's list it moves to the top of the project, out of its section. Esc SHALL close the list and keep the text. While the list shows, the field SHALL be a combobox whose listbox is named "Open tasks", with the chosen option as its active descendant. It SHALL work offline, from the device's own rows, and converge as any task edit does.

#### Scenario: Choose a Someday task in Place
- **WHEN** Place lists "Kitchen renovation", whose tasks "Call the tiler" and "Choose tiles" are in Someday, and the user types "call" into its field, presses ↓ and Enter
- **THEN** the list showed "Call the tiler" only, the task leaves Someday and becomes the project's next action, no task is created, and the project leaves Place

#### Scenario: Enter alone still adds
- **WHEN** the user types "Call" into the same field and presses Enter without moving into the list
- **THEN** a new task "Call" is created in the project as its next action, and "Call the tiler" stays in Someday

#### Scenario: Choose another next action in the project walk
- **WHEN** the card for Garage shows the next action "Measure wall", and the user presses `q`, types "shelf", presses ↓ and Enter on "Buy shelf brackets", a Someday task of Garage
- **THEN** the dialog closes, "Buy shelf brackets" leaves Someday and moves to the top of Garage, the card shows it as the next action, and Next lists it

#### Scenario: Browse without typing
- **WHEN** the field is empty and the user presses ↓
- **THEN** every task that may be chosen is listed in the project's order, "Measure wall" (the current next action) is not among them, and Esc closes the list

#### Scenario: Offline
- **WHEN** the device is offline and the user chooses a task in Place
- **THEN** the project leaves Place at once, and the edit is sent when the connection returns
