## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Opening a projected occurrence
A projected occurrence in Day, Week, Month or Plan SHALL be reachable with Tab and SHALL NOT be selectable with `j` and `k`. Activating it with a click, a tap or Enter SHALL open the occurrence panel for its date (see "Occurrence panel scope"). Dragging it and its menu SHALL follow "Act on one occurrence"; for a viewer of a shared project, and for a completion-relative series, a projection SHALL NOT be draggable, completable or a drop target.

#### Scenario: Open from the keyboard
- **WHEN** the user tabs onto the projected "Study" block of Thursday and presses Enter
- **THEN** the detail panel opens on This occurrence for Thursday 15 October, showing the series' fields and the Complete and Skip actions

#### Scenario: Drag does nothing
- **WHEN** a viewer of the shared project drags a projected block to another slot
- **THEN** the drag does not start and no operation is queued
