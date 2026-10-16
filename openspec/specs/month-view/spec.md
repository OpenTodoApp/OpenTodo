# month-view Specification

## Purpose
A month grid of due dates: which open tasks appear on which day, how a crowded day is shown, and how tasks are rescheduled from the grid by drag and keyboard, offline and converging like every due edit.

## Requirements

### Requirement: Month grid
The client SHALL provide a Month view, reachable by `g m`, from the sidebar and from the Day | Week | Month switch, showing the weeks of the anchor month starting on the user's first day of the week, with days outside the month dimmed and today marked. Each day SHALL list the open tasks due that day in the viewer's zone, with the same selection as Day and Week: deleted, completed and archived-project tasks left out. The view SHALL render from local data and work offline.

#### Scenario: Open the month offline
- **WHEN** the device is offline and the user presses `g m`
- **THEN** the current month renders with every open dated task in its day's cell

#### Scenario: Week start and zoned dues
- **WHEN** the first day of the week is `sun` and a task is due `02:00 Asia/Tokyo` on the 12th viewed from Berlin
- **THEN** each row of the grid starts on a Sunday and the task appears in the cell of the 11th

#### Scenario: Range switch keeps the date
- **WHEN** the user is on the Week view of 2026-11-18 and chooses Month
- **THEN** November 2026 opens, and choosing Day from there opens 2026-11-18

### Requirement: Cell contents
A day cell SHALL list timed tasks first in time order, then the others by priority and position, each showing its time when it has one, its title and its priority. When a cell holds more tasks than fit, it SHALL show the first ones and a "+N more" control that expands the cell. A cell whose tasks carry estimates SHALL show the planned total against the device's day length, marked when over capacity, like a Day column.

#### Scenario: Crowded day
- **WHEN** a day has seven open tasks and the cell fits three
- **THEN** the cell shows three tasks and "+4 more", and activating it shows all seven without leaving the grid

#### Scenario: Over capacity
- **WHEN** a day's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the cell shows `9h / 8h` marked as over capacity

### Requirement: Reschedule from the grid
Dragging a task onto another day SHALL set its due date to that day and keep its time and zone; with a task selected, Left and Right SHALL move it one day and Up and Down one week, following it into the next month when needed. Each move SHALL be one ordinary due edit: applied locally first, queued offline, converging by last-writer-wins. Tasks the user may not edit SHALL not be draggable or movable.

#### Scenario: Drag keeps the time
- **WHEN** the user drags a task due Tuesday 14:30 onto the following Thursday
- **THEN** the task is due that Thursday at 14:30 immediately and the cell shows it

#### Scenario: Move by a week offline
- **WHEN** the device is offline, a task is selected and the user presses Down
- **THEN** the task moves to the same weekday of the next week at once and the change is uploaded on the next sync

#### Scenario: Two devices move the same task
- **WHEN** device A moves a task to the 20th and device B to the 24th, both offline, and both sync
- **THEN** every device shows the task on the date written with the greater timestamp

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer of the shared project a task belongs to
- **THEN** the task is shown but cannot be dragged or moved with the keys

### Requirement: Keyboard in the month
The grid SHALL be a keyboard grid: with no task selected, arrows move the focused day; `j` and `k` select the next and previous task of the month in grid order; Enter opens the selected task; `q` quick-adds a task due on the focused day; Escape clears the selection; `[`, `]` and `t` go to the previous month, the next month and today. No action SHALL require a pointer.

#### Scenario: Add on a day
- **WHEN** the user focuses the 15th with the arrows and presses `q`, types "Dentist" and presses Enter
- **THEN** a task "Dentist" due on the 15th appears in that cell with no network round trip

#### Scenario: Select and open
- **WHEN** the user presses `j` twice and Enter
- **THEN** the second task of the month in grid order opens in the detail panel

### Requirement: Month on narrow screens
Below 640 px the grid SHALL show each day's task count instead of titles, and the focused day's tasks SHALL be listed under the grid with the same rows, selection and actions as a list. Nothing SHALL overflow horizontally.

#### Scenario: Phone layout
- **WHEN** the Month view is opened at 360 px width
- **THEN** the seven columns fit without horizontal scroll, each day shows its count, and tapping a day lists its tasks below the grid
