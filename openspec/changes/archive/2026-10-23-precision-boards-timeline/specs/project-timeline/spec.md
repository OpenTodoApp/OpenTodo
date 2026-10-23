## MODIFIED Requirements

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
A task's bar SHALL span from the earliest to the latest of its start date, due date (in the viewer's zone) and deadline; a single date is a one-day bar. A bar SHALL be drawn as a soft fill of the project's palette hue with a 3 px solid hue edge on its leading side, and the part of a bar before today SHALL be dimmed to the faint tone. A bar at least 96 px wide SHALL show the task's title inside it in the strong text tone; a shorter bar SHALL be followed by its length in days. The due day SHALL be marked inside the bar when it is not one of its ends, and the deadline SHALL be marked by a diamond at its day in the warning tone, followed by "Deadline" and its date when the bar has no other label after it. A task with none of the three, or a `someday` start, SHALL be listed in an "Unscheduled" group at the end with no bar. A task SHALL be late when its deadline or its due day lies before today; a late bar SHALL use the overdue tone for its fill, edge and diamond, taking precedence over the hue, and SHALL be followed by "n days late", counted from the deadline when it has passed and from the due day otherwise.

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
