## ADDED Requirements

### Requirement: Choosing a next action among a project's open tasks
The next-action field of Place on the Loop home, and quick add opened from the weekly review's project walk (`q` or "Add a next action"), SHALL offer the project's open top-level tasks that are neither the current next action, nor blocked, nor assigned to someone else.

- **Listing:** while the field has focus, typing two or more characters SHALL list those whose name contains what was typed (case, accents and spaces at the ends ignored), in the project's list order, at most eight. ↓ in a field with fewer characters SHALL list them all, up to eight; on a touch screen, focusing the empty field SHALL list them with none chosen. Each row SHALL say what choosing it changes: "Someday" or "Starts <date>" for the start it leaves, and the name of the section it moves into ("No section" for none).
- **Choosing:** no task SHALL be chosen until an arrow key moves into the list (hovering only highlights), so Enter SHALL still add what was typed as a new task. Enter on a chosen task, or a click, SHALL make it the next action instead of adding a task, in one edit: it leaves Someday or a later start, and only when the current next action comes before it in the project's list, it moves just above that task, into that task's section. Esc SHALL close the list and keep the text.
- **Undo:** the edit SHALL be one undoable step, shown as "Next action for <project>" with Undo, which puts back the task's start, position and section.
- **Accessibility:** while it offers tasks, the field SHALL be a combobox with `aria-haspopup="listbox"` and `aria-expanded` saying whether the list is open; the listbox is named "Open tasks", the chosen option is the active descendant, and a polite live region announces the number of matches as the user types.

It SHALL work offline, from the device's own rows, and converge as any task edit does, field by field.

#### Scenario: Choose a Someday task in Place
- **WHEN** Place lists "Kitchen renovation", whose tasks "Call the tiler" and "Choose tiles" are in Someday, and the user types "call" into its field, presses ↓ and Enter
- **THEN** the list showed "Call the tiler" with "Someday", the task leaves Someday and becomes the project's next action without moving, no task is created, the project leaves Place, and "Next action for Kitchen renovation" offers Undo

#### Scenario: Undo
- **WHEN** the user activates Undo on that toast
- **THEN** "Call the tiler" is in Someday again at its old place, and Kitchen renovation is back in Place

#### Scenario: Enter alone still adds
- **WHEN** the user types "Call" into the same field and presses Enter without moving into the list
- **THEN** a new task "Call" is created in the project as its next action, and "Call the tiler" stays in Someday

#### Scenario: Choose another next action in the project walk
- **WHEN** the card for Garage shows the next action "Measure wall", and the user presses `q`, types "shelf", presses ↓ and Enter on "Buy shelf brackets", a task of Garage's section "Shopping" listed after it
- **THEN** the row said "No section", the dialog closes, "Buy shelf brackets" moves just above "Measure wall" with no section, the card shows it as the next action, and Next lists it

#### Scenario: Sequential project
- **WHEN** Garage is sequential, "Measure wall" is its next action and "Buy shelf brackets" waits in sequence after it, and the user chooses "Buy shelf brackets"
- **THEN** it moves just above "Measure wall" and is the next action, and "Measure wall" waits in sequence

#### Scenario: Browse without typing
- **WHEN** the field is empty and the user presses ↓
- **THEN** every task that may be chosen is listed in the project's order, the current next action is not among them, and Esc closes the list and sets `aria-expanded` to false

#### Scenario: Offline
- **WHEN** the device is offline and the user chooses a task in Place
- **THEN** the project leaves Place at once, and the edit is sent when the connection returns
