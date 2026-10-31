# recurring-tasks Specification

## Purpose
Defines recurring tasks: the human-readable rule stored on a task, how the next occurrence is computed for calendar and completion-relative rules, end conditions, skipping, editing a series versus one occurrence, and how completions converge when several devices act on the same occurrence offline.

## Requirements

### Requirement: Recurrence rule field
A task SHALL have an optional `recurrence` rule stored as a human-readable string, and an optional `series_id` that links a completed or detached occurrence to its series. Both fields SHALL be additive, settable offline, synced as ordinary field operations and SHALL converge by last-writer-wins. A rule SHALL be accepted only if it parses under the shared grammar; a task with a rule SHALL also have a due date.

#### Scenario: Set a rule offline
- **WHEN** the device is offline and the user sets `every weekday` on a task due tomorrow
- **THEN** the task shows the repeat indicator at once and the rule is uploaded on the next successful sync

#### Scenario: Invalid rule rejected
- **WHEN** a client submits `every blursday` or a rule longer than 200 characters
- **THEN** the write is rejected as an invalid operation and the task keeps its previous rule

#### Scenario: Concurrent rule edits
- **WHEN** device A sets `every day` and device B sets `every week` on the same task offline, and both sync
- **THEN** every device shows the rule with the greater timestamp and computes the same next occurrence from it

### Requirement: Rule grammar
The grammar SHALL be case-insensitive English of the form `every <pattern> [after completion] [until YYYY-MM-DD | for N times]` and SHALL be documented. Patterns SHALL include `day`, `N days`, `week`, `N weeks`, `weekday`, `month`, `N months`, `year`, one or more weekday names, a day of month (`15th`), `last day`, `last weekday`, and an ordinal weekday (`2nd tuesday`, `last friday`). Parsing SHALL produce one canonical lowercase form that is what gets stored.

#### Scenario: Canonical storage
- **WHEN** the user types `Every  2nd  Tuesday`
- **THEN** the stored rule is `every 2nd tuesday` and the preview shows the next three second Tuesdays

#### Scenario: Weekday list
- **WHEN** the user enters `every mon, wed, fri`
- **THEN** the rule is accepted and the next occurrence is the first of those weekdays after the current due date

#### Scenario: Same result on server and client
- **WHEN** the same rule and due date are evaluated by the server and by a client
- **THEN** both produce the same next occurrence date for every rule in the shared test vectors

### Requirement: Next occurrence for calendar rules
For a rule without `after completion`, the next occurrence SHALL be the first date matching the pattern strictly after the current due date that is not an exception date of the series (see "Exceptions come from the records"). If that date is already in the past, the next occurrence SHALL instead be the first matching date after today that is not an exception date, so overdue recurring tasks catch up rather than pile up. Day-of-month patterns that do not exist in a month SHALL use that month's last day. The due time, if any, SHALL be preserved.

#### Scenario: Every last weekday of the month
- **WHEN** a task with `every last weekday` due Friday 2026-10-30 is completed
- **THEN** its due date becomes Monday 2026-11-30

#### Scenario: Catch up after being overdue
- **WHEN** a task with `every day` due five days ago is completed today
- **THEN** its due date becomes tomorrow, with no occurrences generated for the missed days

#### Scenario: Short month
- **WHEN** a task with `every month` due 2027-01-31 is completed
- **THEN** its due date becomes 2027-02-28

#### Scenario: Jump over an exception
- **WHEN** a task with `every day` due the 12th has a skipped record for the 13th and is completed
- **THEN** its due date becomes the 14th

### Requirement: Completion-relative rules
For a rule with `after completion`, the next occurrence SHALL be computed from the local calendar date on which the task was completed, not from the previous due date, and the due time SHALL be preserved.

#### Scenario: Every 3 days after completion
- **WHEN** a task with `every 3 days after completion` due Monday is completed on Wednesday
- **THEN** its due date becomes Saturday

#### Scenario: Completed early
- **WHEN** the same task is completed on the Sunday before its Monday due date
- **THEN** its due date becomes the following Wednesday

### Requirement: End conditions
A rule MAY end on a date (`until YYYY-MM-DD`) or after a number of completed occurrences (`for N times`). When the computed next occurrence is after the end date, or the number of completed occurrences of the series has reached N, completing the task SHALL complete it like a non-recurring task. Skipped occurrences SHALL not count towards N. The count SHALL be derived from the completed occurrence records so that it converges without a separate counter. An open occurrence record SHALL use up one of the remaining occurrences while it is open, so the current occurrence and the projections never exceed `N` minus the done and open records; completing an open record leaves that total unchanged. Every occurrence, records included, SHALL be on or before the `until` date.

#### Scenario: Last occurrence
- **WHEN** a task with `every day until 2026-10-12` due 2026-10-12 is completed
- **THEN** the task gains a completion time and moves to Completed, and no further occurrence is scheduled

#### Scenario: Count reached on two devices
- **WHEN** two devices offline each complete the ninth occurrence of a `for 10 times` series, then sync
- **THEN** both show one ninth completion and the same tenth occurrence due, and the series ends after that tenth completion

#### Scenario: Open record uses up an occurrence
- **WHEN** a series with `every day for 5 times` has two done records, is due today, and tomorrow's occurrence was moved to the evening as an open record
- **THEN** the projections show one more day after tomorrow, and none after it

### Requirement: Skip an occurrence
The user SHALL be able to skip the current occurrence from the detail panel and the keyboard. Skipping SHALL move the task to the next occurrence and SHALL be an ordinary due-date change, so it works offline and converges by last-writer-wins. For a task that is not a habit, skipping SHALL create no occurrence record.

#### Scenario: Skip this week
- **WHEN** the user skips a task with `every monday` due 2026-10-12
- **THEN** its due date becomes 2026-10-19 and nothing is added to Completed

#### Scenario: Skip on two devices
- **WHEN** two devices skip the same occurrence offline and sync
- **THEN** every device shows the task due on the same next occurrence, not two steps ahead

### Requirement: Skipping a habit
For a habit (OpenSpec `habits`), skipping SHALL also write the occurrence record of the skipped date marked `skipped`, with the derived record id, so concurrent skips converge to one record. Such a record SHALL not count towards `for N times`, whether the count is taken on a device or by the server.

#### Scenario: Skip a habit
- **WHEN** the user skips a habit with `every monday` due 2026-10-12
- **THEN** its due date becomes 2026-10-19, nothing is added to Completed, and the 12th shows as skipped in the habit's history

#### Scenario: Skipped habit record does not count
- **WHEN** a habit with `every day for 2 times` is skipped on the first day and completed on the next two
- **THEN** the series ends with the second completion, on every device and when the completion comes through the API

### Requirement: Series edits and detached occurrences
Edits to a recurring task's title, description, project, priority, labels, due time or rule SHALL apply to the series, because the series is the task. The detail panel SHALL offer "This occurrence only", which SHALL write the current occurrence's record (open, no rule, `series_id` and `occurrence_date` set) and move the series to its next free occurrence. The record's id SHALL be derived from the series id and the occurrence date so concurrent detaching converges. When the series' title, priority, labels, project, section, estimate, due time and zone, assignee or location changes, the same batch SHALL write the new value to every open record of the series whose value of that field still equals the series' previous value; done and skipped records, notes and record dates SHALL NOT change. Copies made before records carried `occurrence_date` SHALL stay standalone tasks.

#### Scenario: Rename the series
- **WHEN** the user renames a recurring task
- **THEN** the next occurrence carries the new title after completion, with no prompt

#### Scenario: Detach and move one occurrence
- **WHEN** the user chooses "This occurrence only" on a task with `every monday` due 2026-10-12 and moves the copy to Tuesday
- **THEN** an open record of 2026-10-12 without a rule is due 2026-10-13, and the series is due 2026-10-19 with its rule intact

#### Scenario: Detached on two devices offline
- **WHEN** two devices detach the same occurrence offline and sync
- **THEN** exactly one record of that occurrence exists on every device

#### Scenario: Rename carries to a moved session
- **WHEN** Wednesday's "Study" occurrence was moved to 19:00, Thursday's was renamed "Study: mock exam", and the user renames the series "Spanish"
- **THEN** Wednesday's occurrence is titled "Spanish" at 19:00, Thursday's keeps "Study: mock exam", and the series is "Spanish"

### Requirement: Convergent completion across devices
Completing an occurrence SHALL produce a completed occurrence record whose id is derived from the series id and the occurrence date, carrying the task's fields, the completion time and `series_id`, and SHALL set the series due date to the computed next occurrence. Because both the record id and the next due are functions of the same inputs, devices that complete the same occurrence without seeing each other SHALL converge to one record and one next occurrence.

#### Scenario: Same occurrence completed on two offline devices
- **WHEN** devices A and B both complete the `every day` task due 2026-10-12 while offline, then sync
- **THEN** Completed lists that occurrence once on every device and the task is due 2026-10-13 everywhere

#### Scenario: Completion-relative on different days
- **WHEN** device A completes an `every 3 days after completion` occurrence on Monday and device B completes the same occurrence on Tuesday, both offline, then sync
- **THEN** every device holds one completion record and the series due date from the device whose completion was stamped later

#### Scenario: Deleted series
- **WHEN** a series is deleted on one device while another completes its current occurrence offline
- **THEN** after sync the series stays deleted and the completed occurrence record remains in Completed

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

### Requirement: Deadline follows the series
When a series moves to its next occurrence (by completion, skip or detaching), a deadline on the series SHALL move by the same number of calendar days as the due date moved. The completed occurrence record and a detached copy SHALL keep the deadline of the occurrence they were made from. The shift SHALL be a function of the old and new due dates computed on the device, so devices that complete the same occurrence offline converge on the same deadline.

#### Scenario: Weekly report
- **WHEN** a task with `every monday` due 2026-10-12 and the deadline 2026-10-14 is completed
- **THEN** the series is due 2026-10-19 with the deadline 2026-10-21, and the completed record keeps the deadline 2026-10-14

#### Scenario: Catch-up keeps the distance
- **WHEN** a task with `every day` due 2026-10-09 and the deadline 2026-10-10 is completed on 2026-10-14
- **THEN** the series is due 2026-10-15 with the deadline 2026-10-16

#### Scenario: Two devices complete offline
- **WHEN** two devices complete the same occurrence of a series with a deadline while offline, then sync
- **THEN** every device shows one completed record and the same next due date and deadline

#### Scenario: Series without a deadline
- **WHEN** a series without a deadline is completed
- **THEN** no deadline operation is written and the series still has none

### Requirement: Start date and evening on a series
When a series moves to its next occurrence (by completion, skip or detaching), a start date on the series SHALL move by the same number of calendar days as the due date moved, and the evening flag SHALL stay on the series. The completed occurrence record and a detached copy SHALL keep the start and evening values of the occurrence they were made from. The shift SHALL be a function of the old and new due dates computed on the device, so devices that complete the same occurrence offline converge.

#### Scenario: Weekly task hidden until its day
- **WHEN** a task with `every monday` due 2026-10-19 and the start `2026-10-17` is completed on 2026-10-19
- **THEN** the series is due 2026-10-26 with the start `2026-10-24`, so it is deferred again until the Saturday before

#### Scenario: Evening routine
- **WHEN** a task with `every day` due today and the evening flag is completed
- **THEN** the series is due tomorrow with the evening flag still set, and the completed record carries the flag

#### Scenario: Parking ends the series
- **WHEN** the user parks a recurring task in Someday
- **THEN** its due date and rule are cleared in one batch, as clearing the due date does, and no next occurrence is scheduled

### Requirement: Repeat presets
The Repeat segment of the When popover SHALL show the current rule in words when one is set, then the presets Every day, Every weekday, Every week on the due date's weekday, Every month on the due date's day, Every year on the due date's day and month, and Custom…, which opens the full rule editor in place. A preset SHALL write the same rule the full editor writes for it. Without a due date, the presets SHALL name today's weekday and day. Offline, a preset SHALL apply at once and converge like any other rule edit.

#### Scenario: Weekly preset
- **WHEN** a task is due Thursday 2026-10-22 and the user chooses "Every week on Thursday"
- **THEN** the task repeats weekly on Thursday, and the segment reads "every week on Thursday" above the presets

#### Scenario: Custom rule
- **WHEN** the user chooses Custom…
- **THEN** the full rule editor opens inside the segment with the current rule, and nothing is written until it is changed

#### Scenario: Offline preset
- **WHEN** the device is offline and the user chooses Every day
- **THEN** the rule applies locally at once, and syncs with the usual last-writer-wins rule when the device is back online

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
A projected occurrence in Day, Week, Month or Plan SHALL be reachable with Tab and SHALL NOT be selectable with `j` and `k`. Activating it with a click, a tap or Enter SHALL open the occurrence panel for its date (see "Occurrence panel scope"). Dragging it and its menu SHALL follow "Act on one occurrence"; for a viewer of a shared project, and for a completion-relative series, a projection SHALL NOT be draggable, completable or a drop target.

#### Scenario: Open from the keyboard
- **WHEN** the user tabs onto the projected "Study" block of Thursday and presses Enter
- **THEN** the detail panel opens on This occurrence for Thursday 15 October, showing the series' fields and the Complete and Skip actions

#### Scenario: Drag does nothing
- **WHEN** a viewer of the shared project drags a projected block to another slot
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

### Requirement: Occurrence records
Acting on one occurrence of a series alone SHALL write that occurrence's record: a task with the id derived from the series id and the occurrence date, `series_id` set to the series, no rule, the series' other fields as completion records copy them (with the due on the occurrence date and the deadline and start shifted by as many days as the occurrence date is from the series' due date), and the additive date field `occurrence_date` holding the occurrence date it stands for, written in the same batch that creates the record. A record SHALL be open (moved or edited, still to do), done, or skipped (`completed_at` and `skipped` set). `occurrence_date` SHALL be rejected as invalid on a task without `series_id`, when it is not a `YYYY-MM-DD` date, and when it would change a value already set. A record without `occurrence_date` (written before this field existed) SHALL be read as standing for its due date. Records SHALL be written offline and converge like completion records: devices acting on the same occurrence write the same id, and per-field last-writer-wins keeps the later batch.

#### Scenario: Move Wednesday's session
- **WHEN** "Study" repeats `every weekday` at 18:00, is due Monday 12 October, and the user moves the occurrence of Wednesday 14 October to 19:00
- **THEN** a record with `occurrence_date` 2026-10-14 is due 14 October at 19:00, the series is still due 12 October, and no other occurrence changes

#### Scenario: Same occurrence on two offline devices
- **WHEN** device A moves the occurrence of the 14th to 19:00 and device B completes the occurrence of the 14th, both offline, and both sync
- **THEN** every device holds one record for the 14th, whose state and due are those of the batch written with the greater timestamp

#### Scenario: Invalid occurrence date
- **WHEN** a client writes `occurrence_date` on a task without `series_id`, or changes the `occurrence_date` of an existing record
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Record from before the field
- **WHEN** a completed record written before this change has no `occurrence_date` and is due 5 October
- **THEN** it is read as the record of 5 October and counts towards `for N times` as before

### Requirement: Exceptions come from the records
The exception dates of a series SHALL be the occurrence dates of its records, whatever their state. No projection SHALL be drawn on an exception date, and moving the series to its next occurrence (by completion, skip or "This occurrence only") SHALL go to the first occurrence date after the current one that is not an exception. No list of exceptions SHALL be stored on the series. A device that may edit a series and finds it due on one of its exception dates SHALL write the series' due date, and the deadline and start that move with it, to the next date that is not an exception; the server SHALL apply the same rule before it completes a series. Because the value is a function of synced rows, devices that repair concurrently SHALL converge.

#### Scenario: Completed early, then the series rolls past it
- **WHEN** a series with `every mon, wed, fri` is due Monday the 12th, the user completes Wednesday the 14th early, and later completes Monday
- **THEN** the series is due Friday the 16th, and Wednesday is listed once in Completed

#### Scenario: Two exceptions on two offline devices
- **WHEN** device A skips the occurrence of the 14th and device B moves the occurrence of the 16th, both offline, and both sync
- **THEN** every device shows neither the 14th nor the 16th as a projection and shows the moved occurrence on its new date

#### Scenario: Repair after a late record
- **WHEN** device A, offline, completed the 14th early, and device B completed the current occurrence of the 12th and moved the series to the 14th before receiving A's record
- **THEN** after both sync, the series is due the 16th on every device, written by whichever device repaired first, and Completed holds the 12th and the 14th once each

#### Scenario: Viewer does not repair
- **WHEN** a viewer of a shared project receives a series due on one of its exception dates
- **THEN** the viewer's device writes nothing, and the series moves when a member who may edit it syncs

### Requirement: Act on one occurrence
For a series with a calendar rule, anyone who may edit it SHALL be able to complete, skip or move any occurrence from the current one on, and edit its fields alone, offline: from a projection's menu (Open, Complete this occurrence, Skip this occurrence, Move to…), by dragging a projection in Day, Week, Month or Plan (moves that occurrence only, offered with Undo), and from the occurrence panel. Completing a future occurrence SHALL write a done record and leave the series on its current date; skipping it SHALL write a skipped record; moving or editing it SHALL write an open record. "Delete this occurrence" and deleting an open record SHALL write the skip, never a deletion. Undo of a skip SHALL turn the record into an open occurrence on its date. Acting on the current occurrence SHALL also move the series to its next free date. A projection of a completion-relative series, and any projection for a viewer, SHALL offer Open only. A projection's menu SHALL open with the context key, `Shift+F10` and a long press.

#### Scenario: Skip next Monday's report
- **WHEN** "Weekly report" with `every monday` is due Monday the 12th and the user chooses Skip this occurrence on the projection of the 19th
- **THEN** no projection is drawn on the 19th, nothing is added to Completed, the series is still due the 12th, and after the 12th is completed the series is due the 26th

#### Scenario: Drag a projection
- **WHEN** the user drags the projected "Study" block of Wednesday 18:00 to Wednesday 19:00
- **THEN** an open "Study" occurrence is due Wednesday at 19:00 at once, the 18:00 projection is gone, a toast offers Undo, and Thursday's projection is unchanged

#### Scenario: Complete a future occurrence offline
- **WHEN** the device is offline and the user completes the projected occurrence of Thursday the 15th
- **THEN** the 15th appears in Completed at once, the series stays due on its current date, and the record is uploaded on the next sync

#### Scenario: Completion-relative series
- **WHEN** the user opens the menu of a projection of `every 3 days after completion`
- **THEN** it offers Open only

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens the menu of a projection or drags it
- **THEN** the menu offers Open only and the drag does not start

### Requirement: Occurrence panel scope
The detail panel of a recurring series, of a projection and of an occurrence record SHALL show a scope control under the title with "This occurrence" and "All occurrences", reachable with the keyboard and announced with its selected option. Opened from the series row it SHALL select All occurrences, where edits apply to the series. Opened from a projection or a record it SHALL select This occurrence, name the occurrence date, and apply edits to that occurrence's record, writing the record on the first edit. Choosing This occurrence on the series row and then editing SHALL write the current occurrence's record and move the series on. The control SHALL NOT appear on tasks without a rule that are not records.

#### Scenario: Edit one occurrence from the panel
- **WHEN** the user opens the projection of Wednesday the 14th and changes its title to "Study: exam prep"
- **THEN** a record of the 14th titled "Study: exam prep" exists, the series keeps the title "Study", and the panel stays on This occurrence

#### Scenario: Series row unchanged by default
- **WHEN** the user opens a recurring task from Today and renames it
- **THEN** the panel showed All occurrences, the series is renamed, and no record is written

#### Scenario: Not on a plain task
- **WHEN** the user opens a task without a rule
- **THEN** no scope control is shown

### Requirement: Occurrences through the API and CLI
`POST /api/v1/tasks/{id}/occurrences/{date}/complete`, `POST /api/v1/tasks/{id}/occurrences/{date}/skip` and `PATCH /api/v1/tasks/{id}/occurrences/{date}` SHALL complete, skip, or move and edit one occurrence as the app does, through the op log, and answer the record. They SHALL require a signed-in session or a token allowed to write tasks, and refuse read and agent tokens. They SHALL answer 400 `not_an_occurrence` for a date the series does not produce and has no record for, a date before the current occurrence, or a completion-relative series; 400 `not_recurring` for a task without a rule; 403 for a viewer; 404 for a task the caller cannot see. The occurrence list SHALL report records as `open`, `done` or `skipped` with their id. `ot task occurrence <id> <date> complete|skip|edit` SHALL do the same from the CLI.

#### Scenario: Skip from a script
- **WHEN** a script with a full token posts to `/api/v1/tasks/<report>/occurrences/2026-10-19/skip`
- **THEN** the answer is the skipped record of the 19th, and every device stops drawing the 19th after sync

#### Scenario: Read token refused
- **WHEN** a read token posts to the complete route
- **THEN** the request is refused and nothing is written

#### Scenario: Not an occurrence
- **WHEN** a script completes 2026-10-20, a Tuesday, of a series with `every monday`
- **THEN** the answer is 400 `not_an_occurrence` and nothing is written
