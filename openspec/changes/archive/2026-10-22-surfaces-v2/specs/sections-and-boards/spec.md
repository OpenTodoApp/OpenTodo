# Spec Delta

## MODIFIED Requirements

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column only when it has open tasks, each listing the section's open tasks as cards ordered by position with a per-column count and quick-add. Each column SHALL be drawn as one surface: a faintly sunken fill with the card radius that holds the column header and its cards, so a column reads as a container on the page and not as cards floating on the canvas. The column header SHALL show, inside the surface, the section's icon or colour dot when it has one (OpenSpec `sections-and-boards` "Section colour and icon"), the title, the open-task count in the muted tone with tabular figures, and the column menu; on a board of filters it SHALL also show the rule mark in the muted tone (OpenSpec `custom-views`). A card SHALL use the card surface at the first elevation and lift to the second elevation on hover or focus. An empty column SHALL show its "Add a task" affordance inside the surface. The board SHALL be one of three project layouts (list, board, timeline per `project-timeline`), chosen with the view toggle or by cycling with `v`, remembered per project per device and not synced.

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
- **THEN** the card shows the title, the date, up to three chips and a footer with the comment count, and nothing else

#### Scenario: Column surface
- **WHEN** a board with the columns "Backlog" (3 open tasks) and "Doing" (0 open tasks) is shown in light and in dark
- **THEN** each column is one sunken surface with the card radius holding its header and cards, "Backlog 3" has the count in the muted tone, and "Doing" shows its "Add a task" affordance inside the surface

#### Scenario: Card lifts on hover
- **WHEN** the pointer rests on a card, or a card receives focus
- **THEN** the card is drawn at the second elevation, and returns to the first when the pointer leaves

### Requirement: Move tasks between sections
The user SHALL be able to move a task to another section by dragging it onto a column or heading, by pressing Shift+Left or Shift+Right on the selected task in the board, and by choosing a section in the task detail panel. While a card is dragged over a column, that column SHALL show a dashed placeholder of the dragged card's height, with an edge that meets 3:1 against the column surface, at the end of the column where the card will land, and the dragged card's origin SHALL stay visible at reduced opacity until the drop. A move SHALL set the task's section and place it last in the target column, SHALL apply locally at once and work offline, and SHALL converge so two devices moving the same task resolve to the newer move.

#### Scenario: Drag between columns
- **WHEN** the user drags a task from "Backlog" and drops it on "Doing"
- **THEN** the task appears at the bottom of "Doing" immediately and other devices show the same after sync

#### Scenario: Placeholder while dragging
- **WHEN** the user drags a two-line card from "Backlog" over "Doing"
- **THEN** "Doing" shows a dashed placeholder of that card's height at its end, "Backlog" still shows the card at reduced opacity, and releasing outside any column removes the placeholder and writes nothing

#### Scenario: Keyboard move
- **WHEN** a task in "Backlog" is selected on the board and the user presses Shift+Right
- **THEN** the task moves to the next column and stays selected

#### Scenario: Concurrent moves of one task
- **WHEN** device A moves a task to "Doing" offline while device B moves it to "Done" offline, and both sync
- **THEN** every device shows the task in the column chosen by the move with the greater timestamp

## ADDED Requirements

### Requirement: Board surfaces in the workbench
The workbench SHALL show the board's column surface in these states, each in light and dark at 375 and 1280 px under the accessibility and visual-regression gates: a board with a filled, a styled (icon and colour) and an empty column; a card at rest and a card hovered; a drag in progress with the placeholder in the target column and the origin card at reduced opacity; and a board of filters with a rule mark in a header.

#### Scenario: Drag state has a baseline
- **WHEN** a change alters the placeholder's edge or height
- **THEN** the "drag in progress" story's visual check fails with a diff image

#### Scenario: Placeholder contrast
- **WHEN** the accessibility gate runs the "drag in progress" story
- **THEN** the placeholder's edge measures at least 3:1 against the column surface in both themes
