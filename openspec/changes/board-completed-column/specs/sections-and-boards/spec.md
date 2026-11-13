## ADDED Requirements

### Requirement: Completed column on a project board
While a project's "Show completed tasks" device preference is on (`task-list-presentation` "Completed group in a project"), the project's board SHALL end with a "Completed" column after the last section column and before "Add a section", holding every completed (not skipped) task of the project, most recently completed first, with no manual order. The column SHALL be folded by default on each device and fold and unfold like any column, its fold state kept per device. Dropping a card on the column, folded or not, or moving a card into it with Shift+Right, SHALL complete the task exactly as ticking it does (a repeating task completes its occurrence and moves to its next date). Unticking a card in the column SHALL reopen it in its section; dropping a completed card on a section column, or moving it there with Shift+Left, SHALL reopen it and move it into that section in one batch. Drops between cards of the Completed column SHALL be refused, and a viewer SHALL not be able to drop. Every change SHALL be applied locally at once, work offline, appear on other devices after sync and converge as ticks and moves do, field by field with the greater timestamp winning. While the preference is off, or in a reusable list, the board SHALL show no Completed column. Saved views in the Board layout and boards of filters SHALL be unchanged.

#### Scenario: Finish a card by dropping it
- **WHEN** "Show completed tasks" is on for "Renovation", its Completed column is folded with 4 tasks, and the user drags "Paint the hall" from "Doing" onto the Completed strip
- **THEN** "Paint the hall" is completed, the strip reads 5, the column stays folded, and other devices show the task completed after sync

#### Scenario: Reopen into a section
- **WHEN** the Completed column is unfolded and the user drags the completed "Order tiles" onto the "Backlog" column
- **THEN** "Order tiles" is open again and in "Backlog", in one batch that one Undo takes back

#### Scenario: A repeating card
- **WHEN** the user drops the weekly task "Water the plants" on the Completed column
- **THEN** this week's occurrence is completed and shown in the Completed column, and the task stays in its section with next week's date

#### Scenario: Preference off
- **WHEN** a device has never turned on "Show completed tasks" for "Renovation"
- **THEN** its board shows only the section columns and "Add a section"

#### Scenario: Offline
- **WHEN** the device is offline and the user moves a card into the Completed column with Shift+Right
- **THEN** the task is completed at once, stays completed after a restart, and the completion reaches the server on the next sync

#### Scenario: Viewer
- **WHEN** a viewer of a shared project with the preference on drags a card over the Completed strip
- **THEN** no placeholder appears and nothing is written
