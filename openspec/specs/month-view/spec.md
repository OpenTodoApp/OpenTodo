# month-view Specification

## Purpose
A month grid of due dates: which open tasks appear on which day, how a crowded day is shown, and how tasks are rescheduled from the grid by drag and keyboard, offline and converging like every due edit.

## Requirements

### Requirement: Month grid
The client SHALL provide a Month view, reachable by `g m`, from the sidebar and from the Day | Week | Month switch, showing the weeks of the anchor month starting on the user's first day of the week, with days outside the month dimmed and today marked. Each day SHALL list the open tasks due that day in the viewer's zone, with the same selection as Day and Week: deleted and archived-project tasks left out, completed tasks included only when the Calendar's Show completed tasks choice is on. Completed titles SHALL be struck through and announce their completed status, including the focused-day list on a phone, and SHALL be counted in visible task counts and overflow controls but not planned capacity. Completed tasks SHALL be selectable and openable, but SHALL NOT be rescheduled from the calendar. Identical task rows and the same visibility choice SHALL produce identical cells after sync. The view SHALL render from local data and work offline.

#### Scenario: Open the month offline
- **WHEN** the device is offline and the user presses `g m`
- **THEN** the current month renders with every open dated task in its day's cell

#### Scenario: Week start and zoned dues
- **WHEN** the first day of the week is `sun` and a task is due `02:00 Asia/Tokyo` on the 12th viewed from Berlin
- **THEN** each row of the grid starts on a Sunday and the task appears in the cell of the 11th

#### Scenario: Range switch keeps the date
- **WHEN** the user is on the Week view of 2026-11-18 and chooses Month
- **THEN** November 2026 opens, and choosing Day from there opens 2026-11-18

#### Scenario: Completed work in a month cell
- **WHEN** Show completed tasks is on and an open task and a completed task are due on the same day
- **THEN** both appear in the existing order, the completed title is struck through, only the open task counts towards capacity, and on a phone the count includes both and the focused-day list shows both

### Requirement: Cell contents
A day cell SHALL list timed tasks first in time order, then the others by priority and position, each showing its time when it has one, its title and its priority. Each task row in a cell SHALL be drawn as a soft fill of its project's palette hue with a 3 px solid hue edge on its leading side and the strong text tone, like a calendar block; rows in cells of days before today SHALL be dimmed to the faint tone with a lightened fill. When a cell holds more tasks than fit, it SHALL show the first ones and a "+N more" control that expands the cell. A cell whose tasks carry estimates SHALL show the planned total against the device's day length in the muted tone with tabular figures, marked in the danger tone when over capacity, like a Day column. With the device's "Count meetings in capacity" option on (OpenSpec `time-blocking` "Grid preferences"), the total SHALL add the day's event minutes, a cell with counted event minutes SHALL show the line even without estimated tasks, and a cell over only with meetings SHALL be marked in the warning tone with "Over with meetings", exactly as a Day column.

#### Scenario: Crowded day
- **WHEN** a day has seven open tasks and the cell fits three
- **THEN** the cell shows three tasks and "+4 more", and activating it shows all seven without leaving the grid

#### Scenario: Over capacity
- **WHEN** a day's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the cell shows `9h / 8h` in the danger tone marked as over capacity

#### Scenario: Filled rows
- **WHEN** a cell holds a task of the orange project "Home" and a task without a project
- **THEN** the first row has the orange soft fill and edge and the second the Inbox hue's, both with the title in the strong tone

#### Scenario: Past days dimmed
- **WHEN** the month grid shows the 3rd and today is the 10th
- **THEN** the rows in the cell of the 3rd are in the faint tone with a lightened fill, and the rows of the 10th and later are not

#### Scenario: A meeting-only day
- **WHEN** the option is on and the 12th has 3 hours of busy meetings and no estimated task
- **THEN** the cell of the 12th shows `3h / 8h` in the muted tone

#### Scenario: Over with meetings in the month
- **WHEN** the option is on and the 14th has 6 hours of task estimates and 3 hours of meetings with an 8-hour day length
- **THEN** the cell shows `9h / 8h` in the warning tone with "Over with meetings"

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

### Requirement: Add with the pointer in the month
A double-click on an empty part of a Month day cell SHALL open the add dialog with that date; a right-click there, or a long press of 500 ms on touch, SHALL open the calendar's add menu for that date. Day cells SHALL show a hover state under a fine pointer. The existing `q` on the focused day SHALL stay the keyboard equivalent. The task SHALL be created locally with no network round trip.

#### Scenario: Double-click a day
- **WHEN** the user double-clicks an empty part of the 15th, types "Dentist" and presses Enter
- **THEN** a task "Dentist" due on the 15th appears in that cell at once

#### Scenario: Hover
- **WHEN** a fine pointer moves over the 16th
- **THEN** the 16th's cell shows the hover surface and the 15th's does not

#### Scenario: Double-click on a task row
- **WHEN** the user double-clicks a task row inside a cell
- **THEN** the task opens as before and no add dialog appears
