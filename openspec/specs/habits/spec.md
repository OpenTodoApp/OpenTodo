# habits Specification

## Purpose
Lets a recurring task be tracked as a habit: its streak and month history are derived on the device from the occurrence records the series already writes, and a skip keeps the chain without counting as done.

## Requirements

### Requirement: Habit flag
A task SHALL have an additive boolean `habit`, default false. The detail panel SHALL offer it for an open task whose recurrence rule is a calendar rule (not `after completion`). The flag SHALL be settable offline, synced as an ordinary field operation and SHALL converge by last-writer-wins. A task whose rule is removed or made completion-relative SHALL keep the flag but show no habit statistics until it has a calendar rule again.

#### Scenario: Turn a recurring task into a habit offline
- **WHEN** the device is offline and the user turns on "Track as a habit" on a task with `every day`
- **THEN** the streak and month history appear at once on that device, and the flag reaches the user's other devices on the next sync

#### Scenario: Not offered without a schedule
- **WHEN** the user opens a task with `every 3 days after completion`, or a task without a rule
- **THEN** the habit switch is not offered, and a flag the task already carries changes nothing on screen

#### Scenario: Concurrent toggles
- **WHEN** device A turns the flag on and device B turns it off, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

### Requirement: Skipping a habit records a skipped occurrence
Skipping the current occurrence of a habit SHALL write that date's occurrence record (the same derived id a completion writes, `completed_at` set, `series_id` pointing at the series) with the additive boolean `skipped` true, and move the series on, in one batch. Completing a habit SHALL write the record with `skipped` false. Both SHALL work offline; because the record id is derived, devices acting on the same occurrence converge to one record.

#### Scenario: Skip today
- **WHEN** the user skips a habit with `every day` due 2026-10-14
- **THEN** the series is due 2026-10-15, the 14th shows as skipped in the habit's history, and nothing is added to Completed

#### Scenario: Skip on two devices
- **WHEN** two devices skip the same occurrence of a habit offline and sync
- **THEN** every device holds one skipped record for that date and the series is one step ahead, not two

#### Scenario: Completed on one device, skipped on another
- **WHEN** device A completes the 14th and device B skips the 14th, both offline, and both sync
- **THEN** every device holds one record for the 14th whose state (done or skipped) is the one written with the greater timestamp, and the streak is unbroken either way

#### Scenario: Non-habit skip is unchanged
- **WHEN** the user skips a recurring task that is not a habit
- **THEN** only its due date changes and no record is written

### Requirement: Skipped records are not completions
A skipped occurrence record SHALL NOT appear in Completed, SHALL NOT match `completed` filter queries and SHALL NOT count towards a rule's `for N times`. It SHALL be included in the JSON export and in the habit's history. It SHALL be excluded on every device and by the server's occurrence count, so the end of a series converges.

#### Scenario: Completed view
- **WHEN** a habit was skipped on the 13th and completed on the 14th
- **THEN** Completed lists the 14th only

#### Scenario: Count towards the end condition
- **WHEN** a habit with `every day for 3 times` is skipped once and completed twice
- **THEN** it is still open with a third completion to come, on every device and through the API

#### Scenario: Export
- **WHEN** the user downloads the JSON export
- **THEN** the skipped record is present as a task with `series_id`, `completed_at` and `skipped: true`

### Requirement: Streak derived from the schedule and the records
A habit's scheduled dates SHALL be the dates its calendar rule matches plus any date with an occurrence record. The current streak SHALL count consecutive scheduled dates with a record (done or skipped), walking back from the date before the current occurrence. The current occurrence SHALL be pending, never missed; an earlier scheduled date without a record ends the streak. The best streak is the longest such run. Both SHALL be computed on the device only. Where the computation compares with "today" (the occurrence is at risk once its date is before today; the month grid marks today), today SHALL be the user's logical today (OpenSpec `date-time-preferences`, "Logical today"). A record's date stays the occurrence's due date, whatever the clock said when it was written.

#### Scenario: Three days in a row
- **WHEN** a habit with `every day` has records for the 11th, 12th and 13th and is due on the 14th, not yet done
- **THEN** the streak is 3, shown without an "at risk" mark until the day is over

#### Scenario: Missed day breaks the chain
- **WHEN** the same habit has records for the 11th and 13th but none for the 12th
- **THEN** the streak is 1

#### Scenario: Skipped day keeps the chain
- **WHEN** the same habit has done records for the 11th and 13th and a skipped record for the 12th
- **THEN** the streak is 2, because the skipped day neither breaks nor extends it

#### Scenario: Weekly habit
- **WHEN** a habit with `every mon, wed, fri` has records for Monday and Wednesday and is due on Friday
- **THEN** the streak is 2 and Tuesday and Thursday are not counted as missed

#### Scenario: Same answer on every device
- **WHEN** two devices hold the same series and records
- **THEN** both show the same streak, since it is a function of the rule, the due date and the records alone

#### Scenario: Done after midnight with a day start
- **WHEN** the day start is `04:00`, a habit with `every day` is due on the 14th, and the user completes it at 01:30 on the 15th
- **THEN** the record is for the 14th, the series is due on the 15th, the 14th shows as done, the streak counts it, and the 15th is pending and not at risk until 04:00 has passed on the 16th

#### Scenario: Midnight default is unchanged
- **WHEN** the day start is `00:00`
- **THEN** "at risk" and the month grid's today are those of the calendar date, as before

### Requirement: Month history
The detail panel of a habit SHALL show a grid of one month's days, starting with the current month, navigable to other months with buttons and the keyboard. Each scheduled day SHALL read as done, skipped, missed (scheduled before the current occurrence, no record), pending or upcoming; unscheduled days are blank. Colours SHALL come from the design tokens, states SHALL also differ by glyph, and each day's state SHALL be exposed to assistive technology. The grid is read-only and local.

#### Scenario: October at a glance
- **WHEN** a habit with `every weekday` was done on every weekday of October up to the 13th except the 6th, which was skipped, and the user opens it on the 14th
- **THEN** the grid marks 1, 2, 5, 7–9, 12 and 13 as done, the 6th as skipped, weekends blank, the 14th as pending and the later weekdays as upcoming

#### Scenario: Previous month offline
- **WHEN** the device is offline and the user moves to September
- **THEN** September renders from the records already on the device, with no request

#### Scenario: Screen reader
- **WHEN** a screen reader user moves through the grid
- **THEN** each day is announced with its date and state, such as "6 October, skipped"

### Requirement: Habits in lists and the detail panel
A habit SHALL be an ordinary row in Today, Upcoming, its project and saved views, with a streak chip next to the repeat indicator. The detail panel SHALL show the habit switch, the current and best streak, the month history and the existing Skip control together under the repeat rule, all reachable with the keyboard. No built-in view SHALL be added; the `habit` filter keyword lists habits.

#### Scenario: Streak chip
- **WHEN** Today lists a habit with a streak of 12
- **THEN** its row shows the repeat indicator and a chip reading 12 with an accessible name "12-day streak"

#### Scenario: Habits view from a query
- **WHEN** the user saves the query `habit` as a view named "Habits"
- **THEN** the view lists every open habit, with its streak chip

### Requirement: Integrations complete a habit like any task
Completing a habit through the REST API, CalDAV or an assistant tool SHALL record a done occurrence and move the series exactly as for any recurring task, without knowing about habits. The REST API SHALL accept and return `habit` as a boolean task field; assistant tool results SHALL carry `habit: true` for a habit. No integration SHALL skip a habit.

#### Scenario: Completed through the API
- **WHEN** a script patches a habit's `completed_at` through `/api/v1/tasks/{id}`
- **THEN** the day is recorded as done, the series moves on, and the device's streak counts it after sync

#### Scenario: Invalid flag value
- **WHEN** a client submits `"habit": "yes"` through the API or the sync endpoint
- **THEN** the write is rejected as invalid and the task is unchanged
