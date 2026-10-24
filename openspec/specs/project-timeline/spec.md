# project-timeline Specification

## Purpose
A per-project timeline that draws each open task as a bar between its start, due date and deadline, shows dependencies between tasks, and lets the user move those dates by drag and keyboard, offline and converging per field.

## Requirements

### Requirement: Timeline layout of a project
Every project SHALL offer a timeline layout beside list and board: one row per open task in list order, grouped under its sections with subtasks indented, a horizontal axis of days or weeks with a today line, sticky row labels, horizontal scrolling and `[`, `]` and `t` to move the visible range. Rows SHALL have the list's comfortable height with titles at body size, and section and "Unscheduled" headings SHALL be drawn as the list's group bars (sentence case, the name and the number of rows). The today line SHALL use the accent colour, with a "Today" mark on the axis above it, and a week column SHALL be labelled with its date range. It SHALL render from local data, work offline, and update live as local or synced changes arrive.

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

### Requirement: Bars from start, due and deadline
A task's bar SHALL span from the earliest to the latest of its start date, due date (in the viewer's zone) and deadline; a single date is a one-day bar. A bar SHALL be drawn as a soft fill of the project's palette hue with a 3 px solid hue edge on its leading side, and the part of a bar before today SHALL be dimmed to the faint tone. A bar at least 96 px wide SHALL show the task's title inside it in the strong text tone; a shorter bar SHALL be followed by its length in days. The due day SHALL be marked inside the bar when it is not one of its ends, and the deadline SHALL be marked by a diamond at its day in the warning tone, followed by "Deadline" and its date when the bar has no other label after it. A task with none of the three, or a `someday` start, SHALL be listed in an "Unscheduled" group at the end with no bar. A task SHALL be late when its deadline or its due day lies before today; a late bar SHALL use the overdue tone for its fill, edge and diamond, taking precedence over the hue, and SHALL be followed by "n days late", counted from the deadline when it has passed and from the due day otherwise. The note after a bar (its length, "n days late" or the deadline) SHALL start just after the bar unless it would cross the today line, in which case it SHALL start just past the line; and when it would run past the end of the axis it SHALL end just before the bar instead, so a note never covers the today line or leaves the axis.

#### Scenario: All three dates
- **WHEN** a task starts on the 3rd, is due on the 10th and has a deadline on the 14th
- **THEN** its bar runs from the 3rd to the 14th with a due marker on the 10th and a deadline diamond on the 14th

#### Scenario: Due date only
- **WHEN** a task has only a due date
- **THEN** its bar covers that day and is followed by "1 day"

#### Scenario: Someday
- **WHEN** a task's start is `someday`
- **THEN** it is listed under "Unscheduled" without a bar, whatever its other dates

#### Scenario: Bar in the project hue
- **WHEN** the project is violet and a task's bar runs from the 12th to the 16th with today the 14th
- **THEN** the bar has the violet soft fill and edge, the 12th and 13th part is dimmed, and the 14th to the 16th is not

#### Scenario: Title inside a long bar
- **WHEN** a task "Remove the old splashback" has a bar of 7 days on the day axis
- **THEN** the title is written inside the bar, truncated to fit

#### Scenario: Past deadline wins over the hue
- **WHEN** a violet project's task has a deadline of the 9th and today is the 14th
- **THEN** the bar's fill, edge and diamond use the overdue tone instead of violet, and the bar is followed by "5 days late"

#### Scenario: Overdue due day
- **WHEN** a task with no deadline was due on the 12th and today is the 14th
- **THEN** its bar uses the overdue tone and is followed by "2 days late"

#### Scenario: A past start is not late
- **WHEN** a task's only date is a start on the 10th and today is the 14th
- **THEN** its bar is dimmed and not drawn as late

#### Scenario: Late note clear of the today line
- **WHEN** a task was due yesterday on the day axis, so "1 day late" after its bar would cross the today line
- **THEN** the note starts just past the today line

#### Scenario: Note at the end of the axis
- **WHEN** a one-day bar sits on the axis's last day
- **THEN** its "1 day" note is drawn before the bar, ending just before it

### Requirement: Dependencies on the timeline
For every open task in the project that is blocked by another open task of the project, the timeline SHALL draw an arrow from the blocker's bar end to the dependent's bar start, and SHALL dim the blocked row as lists do. Blockers outside the project, completed or deleted SHALL not be drawn. Moving a blocker SHALL never move its dependents.

#### Scenario: Arrow between two bars
- **WHEN** "Book flights" is blocked by "Confirm dates" and both have dates
- **THEN** an arrow runs from the end of "Confirm dates" to the start of "Book flights", and "Book flights" is dimmed

#### Scenario: Blocker completed
- **WHEN** "Confirm dates" is completed on another device and this device syncs
- **THEN** the arrow disappears and "Book flights" is no longer dimmed, with nothing written for it

### Requirement: Reschedule from the timeline
Dragging a bar SHALL shift every date the task has (start, due date keeping its time and zone, deadline) by the dragged number of days, one operation per field in one batch; dragging the left edge SHALL set the start and the right edge the deadline, creating the field when absent. Dragging an unscheduled row onto the axis SHALL set its due date. Each write SHALL apply locally first, queue offline and converge per field by last-writer-wins. Viewers of a shared project SHALL not be able to drag.

#### Scenario: Shift a bar
- **WHEN** a task starting on the 3rd and due on the 10th at 09:00 is dragged two days to the right
- **THEN** it starts on the 5th and is due on the 12th at 09:00, and both changes reach other devices after sync

#### Scenario: Create a deadline by resizing
- **WHEN** the user drags the right edge of a one-day bar of a task due on the 10th to the 14th
- **THEN** the task keeps its due date and gains the deadline of the 14th

#### Scenario: Concurrent edits of different dates
- **WHEN** device A shifts a bar by two days while device B sets its deadline, both offline, and both sync
- **THEN** the start and due date come from A and the deadline from the write with the greater timestamp, because each is its own field

### Requirement: Keyboard on the timeline
`j` and `k` SHALL select rows, Enter SHALL open the selected task, Left and Right SHALL shift the selected task's dates by one day, Shift+Left and Shift+Right SHALL move its deadline (creating it from the due date when absent), and the day/week zoom SHALL be reachable by Tab. No rescheduling SHALL require a pointer; the start is also editable from the detail panel.

#### Scenario: Shift with arrows offline
- **WHEN** the device is offline, a task due on the 10th is selected and the user presses Right three times
- **THEN** the task is due on the 13th at once and the change is uploaded on the next sync

#### Scenario: Deadline from the keyboard
- **WHEN** a task due on the 10th with no deadline is selected and the user presses Shift+Right
- **THEN** the task gains the deadline of the 11th and the bar extends

### Requirement: Timeline on narrow screens
Below 640 px the row labels SHALL stay visible while the axis scrolls horizontally, bars SHALL remain draggable by touch after a press and hold, and the page SHALL not scroll horizontally as a whole.

#### Scenario: Phone layout
- **WHEN** the timeline is opened at 360 px width
- **THEN** task names stay in view while the axis scrolls, and the layout check reports no horizontal overflow
