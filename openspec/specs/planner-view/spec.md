# planner-view Specification

## Purpose
The calendar's Plan mode: the next days as columns of dated tasks without a time axis, a capacity bar per day that counts estimates, subscribed calendar events and the projected occurrences of recurring tasks, and rescheduling across days by drag and keyboard, offline and converging like every due edit.

## Requirements

### Requirement: Plan mode
The client SHALL provide a Plan mode of the Calendar destination, reachable by `g` then `Shift+C`, from the sidebar's Calendar item when it was the last mode used on the device, and from the Day | Week | Month | Plan switch, showing a span of consecutive days as columns starting on the anchor day (today by default, or the day carried in the address). The view SHALL render from local data and work offline. The span SHALL be 7, 14 or 21 days, 14 by default, chosen per device and never synced.

#### Scenario: Open the plan offline
- **WHEN** the device is offline and the user presses `g` then `Shift+C`
- **THEN** fourteen columns from today render, each with its open dated tasks, and the sidebar's Calendar item opens the Plan from then on

#### Scenario: Span kept on this device
- **WHEN** the user chooses "21 days" from the page's menu and reloads
- **THEN** twenty-one columns are shown, and another device signed into the same account still shows its own span

#### Scenario: Range switch keeps the date
- **WHEN** the user is on the Plan with the 5th of next month focused and chooses Day
- **THEN** the Day view of the 5th opens, and choosing Plan from the Week of the 18th opens a span starting on the 18th

### Requirement: Column contents
Each column SHALL list the open tasks due that day in the viewer's zone with the same selection as Day, Week and Month (deleted, completed and archived-project tasks left out), timed tasks first in time order, then the others by priority and position. Each row SHALL show its time when it has one, its title, its estimate and its priority. Columns SHALL NOT be manually ordered.

#### Scenario: Zoned due on the viewer's day
- **WHEN** a task is due `02:00 Asia/Tokyo` on the 12th and the user views the Plan from Berlin
- **THEN** the task appears in the column of the 11th with its Berlin time

#### Scenario: Order within a column
- **WHEN** a day holds a task at 14:00, a task at 09:00, a priority 1 task without a time and a priority 4 task without a time
- **THEN** the column lists 09:00, 14:00, the priority 1 task, then the priority 4 task

#### Scenario: Not reordered by hand
- **WHEN** the user tries to drag a row above another in the same column or presses Alt+Up on it
- **THEN** nothing moves and no operation is queued

### Requirement: Column layout
From 640 px the columns SHALL be laid out seven per row with no horizontal scrolling, today first, each row of columns as tall as its longest column, and the page scrolling only in the content column.

#### Scenario: Fourteen days on a desktop
- **WHEN** the Plan is opened at 1280 px with the 14-day span
- **THEN** two rows of seven columns are shown, today first, with no horizontal scrollbar

#### Scenario: Three weeks
- **WHEN** the span is 21 days
- **THEN** three rows of seven columns are shown and the content column scrolls vertically when they do not fit

### Requirement: Capacity bar per day
Each column header SHALL show a capacity bar and the planned total against the device's day length, summing three sources: the estimates of the day's open tasks, the minutes of the day's busy subscribed calendar events, and the estimates of projected occurrences of recurring tasks. Tasks and projections without an estimate SHALL count as zero and be reported. The bar SHALL mark the day when the sum exceeds the day length.

#### Scenario: Three sources on one day
- **WHEN** a day has open tasks estimated at 2 h 50, a 10:00 to 11:30 meeting from a subscribed calendar, a projected weekly task estimated at 45 minutes and five unestimated tasks, with an 8-hour day length
- **THEN** the header reads `5h 5m / 8h` and its tooltip reads "2h 50m of tasks, 1h 30m in calendar events, 45m repeating · 5 tasks without estimate"

#### Scenario: Over capacity
- **WHEN** a day's three sources total 9 hours with an 8-hour day length
- **THEN** the header shows `9h / 8h` marked as over capacity, and the mark is announced to assistive technology

#### Scenario: Completing a task
- **WHEN** a task listed in a column is completed
- **THEN** its row leaves the column and the day's total decreases by its estimate

### Requirement: Event minutes in the capacity
The event minutes of a day SHALL be the minutes inside that day, in the viewer's zone, of the busy timed occurrences of enabled subscribed calendars shown on this device, with overlapping events counted once; all-day and free events SHALL NOT count. A day without shown events SHALL count zero event minutes.

#### Scenario: Overlapping meetings
- **WHEN** two busy events run 10:00 to 11:00 and 10:30 to 11:30 on the same day
- **THEN** the day counts 1h 30m for events, not 2h

#### Scenario: Event across midnight
- **WHEN** a busy event runs from 22:00 to 02:00 the next day
- **THEN** the first day counts 2h and the next day counts 2h

#### Scenario: Calendars hidden or unavailable
- **WHEN** the user hides calendars on this device, or the day lies outside the device's event cache while offline
- **THEN** no event minutes are counted for it, and offline the header's status says calendars are unavailable for those days

### Requirement: Projected occurrences of recurring tasks
For every open task with a recurrence rule, the occurrences that would follow its current one within the shown span SHALL be computed on the device from the rule, the current due date and the series' completed count, and drawn in their columns as dimmed rows with the task's title, time and estimate and a "projected" marker. The series itself SHALL remain one ordinary row on its current date. A rule's end condition SHALL stop the projection.

#### Scenario: Weekly report
- **WHEN** today is Monday the 12th, a task "Weekly report" with `every monday` and a 45-minute estimate is due today, and the span is 21 days
- **THEN** the 12th shows the task as an ordinary row and the 19th and 26th show it dimmed as projected, each counting 45 minutes in its column's total

#### Scenario: Projection follows the series
- **WHEN** the user drags the "Weekly report" row from the 12th to the 13th
- **THEN** the series is due the 13th, and the projections move to the following Mondays computed from the new due date, with no other operation written

#### Scenario: End condition
- **WHEN** a task with `every day for 3 times` has two completed occurrences and is due today
- **THEN** no projection is drawn after today

#### Scenario: Completion-relative rule
- **WHEN** a task with `every 3 days after completion` is due the 14th
- **THEN** projections are drawn on the 17th and 20th, as if each occurrence were completed on its day

#### Scenario: Catch-up series
- **WHEN** a task with `every day` is due five days ago
- **THEN** the series is not listed in any column (its date is before the span) and projections are drawn from tomorrow on, as the next occurrence after today

### Requirement: Projections are derived and read-only
Projected occurrences SHALL NOT be draggable, movable, selectable, completable or drop targets, SHALL be marked for assistive technology as projected, and SHALL be written nowhere: no operation, no local row, no synced cache. Because they are a function of the synced series row and the shared rule calculator, every device SHALL draw the same projections; there is nothing to converge.

#### Scenario: Projection is read-only
- **WHEN** the user drags on a projected row, or selects rows with `j` and `k`
- **THEN** nothing is written, the drag does not start, and `j` and `k` skip the projected rows

#### Scenario: Same projections on two devices
- **WHEN** two devices hold the same operations for a series with `every 2 weeks`
- **THEN** both show the projection on the same days of the span, offline or online

#### Scenario: Nothing in the operation log
- **WHEN** the Plan has been open with projections drawn and the device syncs
- **THEN** no operation about the projected dates is uploaded

### Requirement: Calendar events in the plan
Each column SHALL list the day's occurrences of enabled subscribed calendars, when calendars are shown on this device, as read-only rows in their calendar's colour, timed ones with their time and duration above the tasks and all-day ones as a chip under the header, read from the device's event cache so they show offline as of the last refresh. Event rows SHALL NOT be draggable, movable, selectable or drop targets, and SHALL be reachable with the keyboard for reading.

#### Scenario: Meeting listed with the tasks
- **WHEN** a "Team sync" event runs 10:00 to 11:00 on a day with two tasks
- **THEN** the column shows "Team sync, 10:00, 1h" in its calendar's colour above the two task rows and counts the hour in the capacity bar

#### Scenario: Read with the keyboard
- **WHEN** the user tabs onto an event row and presses Enter
- **THEN** a read-only popover shows the summary, time, location and calendar name, and Escape closes it

#### Scenario: Open offline
- **WHEN** the device is offline and the user opens the Plan
- **THEN** the events fetched last time are listed and the header says "Calendars as of <time>"

### Requirement: Reschedule from the plan
Dragging a task row onto another column SHALL set its due date to that day and keep its time and zone; with a row selected, Left and Right SHALL move it one day and Up and Down seven days, following it to a new span when it leaves the shown one. Each move SHALL be one ordinary due edit: applied locally first, queued offline, converging by last-writer-wins. Tasks the user may not edit SHALL be shown but SHALL NOT be draggable or movable.

#### Scenario: Drag keeps the time
- **WHEN** the user drags a task due Tuesday 14:30 onto the column of the following Thursday
- **THEN** the task is due that Thursday at 14:30 immediately and the Thursday column shows it

#### Scenario: Move a week offline
- **WHEN** the device is offline, a row is selected and the user presses Down
- **THEN** the task moves to the same weekday of the next week at once and the single due operation is uploaded on the next sync

#### Scenario: Two devices move the same task
- **WHEN** device A moves a task to the 20th and device B to the 24th, both offline, and both sync
- **THEN** every device shows the task on the date written with the greater timestamp

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer of the shared project a task belongs to
- **THEN** the task is shown without a drag handle and the arrows do not move it

#### Scenario: Moved past the span
- **WHEN** the last column is the 25th, a task on the 25th is selected and the user presses Right
- **THEN** the task is due the 26th and the span moves so that the 26th is shown with the task still selected

### Requirement: Keyboard in the plan
The columns SHALL be a keyboard grid: with no row selected, arrows move the focused day; `j` and `k` select the next and previous task row in column order, skipping event and projected rows; Enter opens the selected task; `c` completes it; `q` quick-adds a task due on the focused day; Escape clears the selection; `[`, `]` and `t` move the span one week back, one week forward and back to today. No action SHALL require a pointer.

#### Scenario: Add on a day
- **WHEN** the user focuses the column of the 15th with the arrows and presses `q`, types "Dentist" and presses Enter
- **THEN** a task "Dentist" due on the 15th appears in that column with no network round trip

#### Scenario: Select and open
- **WHEN** the user presses `j` twice and Enter
- **THEN** the second task row in column order opens in the detail panel

#### Scenario: Week back
- **WHEN** the span starts today and the user presses `[`
- **THEN** the span starts seven days ago and `t` brings it back to today

### Requirement: Plan on narrow screens
Below 640 px the Plan SHALL list the days vertically, each with its header, capacity bar, event rows, task rows and projected rows, with the same selection, actions and detail panel as the columns and no horizontal overflow.

#### Scenario: Plan on a phone
- **WHEN** the user opens the Plan on a 390 px screen
- **THEN** the days are listed vertically with their capacity bars and rows, projected rows dimmed, and no columns are rendered

#### Scenario: Open a task from the agenda
- **WHEN** the user taps a task row twice on the phone
- **THEN** the detail panel opens as a sheet, where the due date can be changed
