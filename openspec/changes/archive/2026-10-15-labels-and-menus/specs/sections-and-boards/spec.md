# Spec Delta

## MODIFIED Requirements

### Requirement: Section lifecycle
Sections SHALL be renamable, reorderable among the sections of their project, and deletable from the heading or column menu and from the keyboard. Deleting a section SHALL require confirming a dialog stating how many open tasks move to "No section". It SHALL set its deletion time and SHALL move its open tasks to "No section" by clearing their section reference, one operation per task. Deleted sections SHALL be hidden from all views and list endpoints and included in the export. These actions work offline and converge.

#### Scenario: Reorder
- **WHEN** the user moves "Doing" before "Backlog"
- **THEN** both the list headings and the board columns show "Doing" first on this device now and on other devices after sync

#### Scenario: Delete with tasks
- **WHEN** the user confirms deletion of "Doing", which holds two open tasks
- **THEN** the section disappears and the two tasks are listed under "No section"

#### Scenario: Confirmation states the impact
- **WHEN** the user chooses "Delete section" in the menu of "Doing", which holds two open tasks
- **THEN** a dialog says the two open tasks move to "No section", and Cancel leaves the section and its tasks untouched
