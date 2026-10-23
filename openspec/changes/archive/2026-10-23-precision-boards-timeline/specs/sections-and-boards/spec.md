## MODIFIED Requirements

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column only when it has open tasks, each listing the section's open tasks as cards ordered by position with a per-column count and quick-add. Each column SHALL be drawn as one surface: a sunken band with the card radius that holds the column header and its cards and runs the full height of the board whatever the number of cards, so a column reads as a container on the page and not as cards floating on the canvas. The column header SHALL show, inside the surface, the section's icon or colour dot when it has one (OpenSpec `sections-and-boards` "Section colour and icon"), the title, the open-task count in the muted tone with tabular figures, and the column menu; on a board of filters it SHALL also show the rule mark in the muted tone (OpenSpec `custom-views`). In an editable project every column SHALL end its cards with an "Add a task" affordance inside the surface, and the row of columns SHALL end with an "Add a section" column: a dashed outline of the board's height with a plus icon that turns into the section name field. A card SHALL use the raised surface at the first elevation and lift to the second elevation on hover or focus; it SHALL show the title on at most two lines and then one property row: the date with a calendar icon in its due tone, the estimate with a clock icon and the subtask progress with a check icon first, then the task's other facts and its label chips, and the assignee at the row's end. The board SHALL be one of three project layouts (list, board, timeline per `project-timeline`), chosen with the view toggle or by cycling with `v`, remembered per project per device and not synced.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Cycle through the layouts
- **WHEN** the project is shown as a board and the user presses `v` twice
- **THEN** the timeline is shown after the first press and the list after the second, and the last choice is remembered for that project on that device

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column

#### Scenario: Tall column
- **WHEN** a column holds more cards than fit the screen height
- **THEN** that column scrolls inside itself and the page header stays in place

#### Scenario: Board on a phone
- **WHEN** a project with three sections opens as a board on a 390 px screen
- **THEN** the first column with open tasks fills most of the width, swiping snaps to the next column and the pager shows three dots

#### Scenario: Card content
- **WHEN** a task with a date, three labels, an estimate and two comments is shown as a card
- **THEN** the card shows the title, then one property row with the date and its calendar icon, the estimate and its clock icon, up to three chips and the comment count, and nothing else

#### Scenario: Assignee at the end of the card
- **WHEN** a task of a shared project with a date and an assignee is shown as a card
- **THEN** the assignee's avatar ends the card's property row, after the date

#### Scenario: Column surface
- **WHEN** a board with the columns "Backlog" (3 open tasks) and "Doing" (0 open tasks) is shown in light and in dark
- **THEN** each column is one sunken band with the card radius holding its header and cards, both bands reach the bottom of the board, "Backlog 3" has the count in the muted tone, and each column shows its "Add a task" affordance inside the surface after its cards

#### Scenario: Add a section from the board
- **WHEN** the user activates "Add a section" at the end of an editable board, types "Garden" and presses Enter
- **THEN** a "Garden" column appears before the "Add a section" column, and a read-only board shows no "Add a section" column

#### Scenario: Card lifts on hover
- **WHEN** the pointer rests on a card, or a card receives focus
- **THEN** the card is drawn at the second elevation, and returns to the first when the pointer leaves
