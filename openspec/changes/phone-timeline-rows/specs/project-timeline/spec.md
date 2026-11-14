# Spec Delta

## MODIFIED Requirements

### Requirement: Timeline layout of a project
Every project SHALL offer a timeline layout beside list and board: one row per open task in list order, grouped under its sections with subtasks indented, a horizontal axis of days or weeks with a today line, sticky row labels, horizontal scrolling and `[`, `]` and `t` to move the visible range. With a mouse from 768 px, rows SHALL have the list's comfortable height with titles at body size; narrower screens and touch screens follow "Timeline on narrow screens". Section and "Unscheduled" headings SHALL be drawn as the list's group bars (sentence case, the name and the number of rows). The today line SHALL use the accent colour, with a "Today" mark on the axis above it, and a week column SHALL be labelled with its date range. It SHALL render from local data, work offline, and update live as local or synced changes arrive.

#### Scenario: Open the timeline offline
- **WHEN** the device is offline and the user switches a project to its timeline
- **THEN** every open task of the project is listed in list order with its bar, and completing one on this device removes its row at once

#### Scenario: Remote change updates a bar
- **WHEN** another device moves a task's deadline and this device syncs
- **THEN** the bar's end moves without a reload

#### Scenario: Zoom
- **WHEN** the user switches the axis from days to weeks
- **THEN** each column is a week starting on the user's first day of the week, labelled with its range such as "20–26 Oct", and bars keep their dates

#### Scenario: Today mark
- **WHEN** the timeline shows a range that contains today
- **THEN** an accent line runs down today's column and the axis shows "Today" above it

#### Scenario: Sections as group bars
- **WHEN** a project's timeline has a "Kitchen" section with 4 dated tasks
- **THEN** the rows sit under a group bar reading "Kitchen" and "4", in sentence case

### Requirement: Timeline on narrow screens
Below 768 px a task's row SHALL be its name on one line across the width of the grid with its bar under it, instead of a name column beside the grid: the name SHALL stay at the grid's left edge while the axis scrolls horizontally, and the grid SHALL have the timeline's whole width. Such a row SHALL be at least 44 px tall, the whole row SHALL be the control that carries the task's name, and no two names SHALL share a touch area. From 768 px the names stay beside the grid, and on a touch screen a row there SHALL be at least 44 px tall.

On a touch screen a tap on a task's name SHALL open the task; with a mouse a click selects the row and a double click opens it, at every width. Bars SHALL remain draggable by touch — a press and hold arms the drag with held feedback and the movement after it drags, where a movement before the hold is a scroll — and a tap on a bar selects its row. Group bars, the today line and its mark, dependency arrows and the notes after bars SHALL be drawn as at wider widths, the arrows between the bars. The page SHALL not scroll horizontally as a whole.

The hint above the grid SHALL keep its sentence about dragging on every device, and its sentence about keys SHALL only be drawn where a key can be pressed (keyboard hints on touch devices).

The layout is drawn from local data and writes nothing, so it is the same offline; opening a task and dragging a bar behave as "Reschedule from the timeline" states.

#### Scenario: Phone layout
- **WHEN** the timeline is opened at 360 px width with a task named "Kitchen cabinets and the counter top"
- **THEN** the whole name is on one line above the task's bar, it stays in view while the axis scrolls, about ten days of the axis are visible, and the layout check reports no horizontal overflow

#### Scenario: Rows fit a finger
- **WHEN** the timeline is opened on a phone with five unscheduled tasks in a row
- **THEN** each row is at least 44 px tall and no two names' touch areas overlap

#### Scenario: Tap a name
- **WHEN** a user on a phone taps a task's name on the timeline
- **THEN** the task opens

#### Scenario: Press, hold, then move drags a bar
- **WHEN** a user on a touch screen presses a bar, holds still past the hold interval and then moves
- **THEN** the bar drags with its usual feedback, and a movement before the hold elapsed only scrolled the view

#### Scenario: Touch screen from 768 px
- **WHEN** the timeline is opened on a 768 px wide touch screen
- **THEN** the names stay in their column beside the grid and each row is 44 px tall

#### Scenario: Hint without keys on a phone
- **WHEN** an editor opens the timeline on a phone with no keyboard
- **THEN** the hint reads "Drag a bar to move its dates, or its ends to set the start and deadline." and says nothing about arrow keys

#### Scenario: Unchanged with a mouse
- **WHEN** the timeline is opened at 1280 px with a mouse
- **THEN** rows are 36 px with the names in a column beside the grid, a click on a name selects its row, and the hint also names the arrow keys
