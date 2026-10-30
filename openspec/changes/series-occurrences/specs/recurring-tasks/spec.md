## MODIFIED Requirements

### Requirement: Recurring tasks in views
Today, Upcoming and project views SHALL show a recurring task once, at its current occurrence, with a repeat indicator and the rule visible in the detail panel. Completed SHALL list each completed occurrence as its own entry. The detail panel SHALL show a preview of the next three occurrences, computed locally, and SHALL make the rule, skip and detach controls reachable with the keyboard. The calendar's Plan mode (OpenSpec `planner-view`) SHALL additionally draw the occurrences that would follow the current one, dimmed and read-only, computed on the device from the rule and never written. Day, Week and Month SHALL draw them too while the device's "Show repeating occurrences" switch is on (see "Projected occurrences in the calendar"), and Upcoming SHALL list them only when its own switch is on (see "Repeating occurrences in Upcoming"); every other view shows only the current occurrence.

#### Scenario: One row per series
- **WHEN** Upcoming is opened with a task due tomorrow that repeats daily, and Upcoming's "Show repeating occurrences" is off
- **THEN** the task appears under Tomorrow only, with the repeat indicator

#### Scenario: Preview updates offline
- **WHEN** the device is offline and the user changes the rule in the detail panel
- **THEN** the next-three preview updates immediately

#### Scenario: Projected in the plan only
- **WHEN** the calendar's "Show repeating occurrences" is off on the device and a task with `every monday` due next Monday is viewed in Upcoming, the Month and the Plan
- **THEN** Upcoming and the Month list it on next Monday only, and the Plan lists it on next Monday as a row and on the Mondays after as dimmed projections that cannot be moved and write nothing

## ADDED Requirements

### Requirement: Projected occurrences in the calendar
While the device's "Show repeating occurrences" switch is on, Day, Week and Month SHALL draw, for every open recurring task they would show, the occurrences that follow its current one inside the shown range: computed on the device from the series row and its occurrence records with the calculator Plan uses (the same dates on every device, offline included), stopped by the rule's end condition, at most 31 per series per range, and never written as an operation, row or cache. A timed projection SHALL be a block at its time sized by the series' estimate, a date-only projection a chip in the day's unscheduled lane, and in Month a row in the day's cell ordered with the day's tasks. A projection SHALL be drawn in the projected style (faint fill of the series' project hue, dashed leading edge, repeat icon) and SHALL be announced as projected with its date. No projection SHALL be drawn on or before the current occurrence, nor before today. The series itself SHALL stay one ordinary block or row on its current date. Below 640 px the Week agenda and the Month day list SHALL list projections as dimmed rows after the day's tasks; the Month grid's per-day count SHALL count tasks only.

#### Scenario: Weekday study sessions
- **WHEN** "Study" repeats `every weekday` at 18:00 with a 60-minute estimate, is due Monday the 12th, and the user opens that Week
- **THEN** Monday shows "Study" as an ordinary block at 18:00, and Tuesday to Friday show dashed, faint "Study" blocks at 18:00 marked as projected

#### Scenario: A habit on the month
- **WHEN** a habit with `every mon, wed, fri` is due Wednesday the 14th and the user opens the Month
- **THEN** the 14th lists the habit as a row and every later Monday, Wednesday and Friday of the grid lists it as a projected row

#### Scenario: End condition
- **WHEN** a task with `every day for 5 times` has three completed occurrences and is due today
- **THEN** the Week draws one projection, tomorrow, and none after it

#### Scenario: Same projections offline on two devices
- **WHEN** two devices hold the same rows for a series with `every 2 weeks`, one of them offline
- **THEN** both draw the projections on the same days, and no operation about them is queued or uploaded

#### Scenario: Switch off on this device
- **WHEN** the user turns off "Show repeating occurrences" in the calendar's menu and reloads
- **THEN** Day, Week and Month show each series on its current date only, the Plan still draws its projections, and another device of the same account keeps its own setting

#### Scenario: Phone week
- **WHEN** the Week is opened on a 390 px screen with a daily series due today
- **THEN** each following day of the agenda lists the series as a dimmed row with the repeat icon after that day's tasks, and nothing overflows horizontally

### Requirement: Projections in the calendar capacity
The planned total of a Day or Week column and of a Month cell SHALL add the estimates of the projections it draws, and its tooltip SHALL name them separately ("45m repeating"). A projection without an estimate SHALL count as zero and join the count of items without an estimate. Projections that are not drawn SHALL NOT be counted.

#### Scenario: Weekly report in the week
- **WHEN** "Weekly report" repeats `every monday` with a 45-minute estimate, is due this Monday, and the user opens next week with the switch on
- **THEN** next Monday's planned total includes 45 minutes and its tooltip reads "45m repeating" among the sources

#### Scenario: Switch off
- **WHEN** the same week is opened with "Show repeating occurrences" off
- **THEN** next Monday's planned total does not include the 45 minutes

### Requirement: Opening a projected occurrence
A projected occurrence in Day, Week, Month or Plan SHALL be reachable with Tab and SHALL NOT be selectable with `j` and `k`. Activating it with a click, a tap or Enter SHALL open its series in the detail panel with the projected date named under the title. A projection SHALL NOT be draggable, completable or a drop target, and the user's role on a shared project SHALL NOT change that.

#### Scenario: Open from the keyboard
- **WHEN** the user tabs onto the projected "Study" block of Thursday and presses Enter
- **THEN** the detail panel opens the "Study" series with the line "Projected for Thursday 15 October · next due Monday 12 October"

#### Scenario: Drag does nothing
- **WHEN** the user drags a projected block to another slot
- **THEN** the drag does not start and no operation is queued

### Requirement: Repeating occurrences in Upcoming
Upcoming SHALL offer "Show repeating occurrences" in its page menu, off by default and kept per device. While it is on, Upcoming SHALL list, under each day heading of the next 14 days after today, the projected occurrences of open recurring tasks falling on that day, as dimmed read-only rows with the repeat icon after the day's tasks, with a note on the last such day naming the date up to which they are shown. The rows SHALL follow "Opening a projected occurrence" and SHALL NOT be counted in Upcoming's task counts.

#### Scenario: Turned on
- **WHEN** a task repeats `every day`, is due tomorrow, and the user turns on "Show repeating occurrences" in Upcoming
- **THEN** Tomorrow lists the task as an ordinary row, each of the following 13 days lists it as a dimmed projected row, and the last of them notes "Repeating tasks shown up to" that date

#### Scenario: Default off
- **WHEN** a new device opens Upcoming
- **THEN** no projected row is listed

### Requirement: Occurrences for integrations
`GET /api/v1/tasks/{id}/occurrences` SHALL list a recurring task's occurrences in an inclusive date range (`from` defaulting to today, `to` to 30 days after `from`, at most 366 days) as floating dates with the series' time and zone and a state (`current` for the series' due date, `projected` otherwise), computed with the server's port of the shared calculator so it matches every device. The route SHALL require a signed-in session or a token with read access. The CLI SHALL print the same list with `ot task occurrences <id>`, and the agent tools' output for a recurring task SHALL carry its next three projected dates.

#### Scenario: List a month of sessions
- **WHEN** a script calls `GET /api/v1/tasks/<study>/occurrences?from=2026-10-12&to=2026-10-18` for "Study" with `every weekday` at 18:00 due 2026-10-12
- **THEN** the answer lists 12 October as `current` and 13 to 16 October as `projected`, each at 18:00

#### Scenario: Not signed in
- **WHEN** a request without a session or token calls the route
- **THEN** it is answered 401 and nothing is computed

#### Scenario: Not a recurring task
- **WHEN** the route is called for a task without a rule, or with `from` after `to`, or with a range of 400 days
- **THEN** the answer is 400 with `not_recurring` for the first and `invalid_input` for the others

#### Scenario: Same dates as the app
- **WHEN** the route and a device compute the occurrences of the same series and range
- **THEN** they list the same dates for every case in the shared occurrence vectors
