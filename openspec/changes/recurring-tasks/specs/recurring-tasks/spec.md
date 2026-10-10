# Spec Delta

## Purpose

Defines recurring tasks: the human-readable rule stored on a task, how the next occurrence is computed for calendar and completion-relative rules, end conditions, skipping, editing a series versus one occurrence, and how completions converge when several devices act on the same occurrence offline.

## ADDED Requirements

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
For a rule without `after completion`, the next occurrence SHALL be the first date matching the pattern strictly after the current due date. If that date is already in the past, the next occurrence SHALL instead be the first matching date after today, so overdue recurring tasks catch up rather than pile up. Day-of-month patterns that do not exist in a month SHALL use that month's last day. The due time, if any, SHALL be preserved.

#### Scenario: Every last weekday of the month
- **WHEN** a task with `every last weekday` due Friday 2026-10-30 is completed
- **THEN** its due date becomes Monday 2026-11-30

#### Scenario: Catch up after being overdue
- **WHEN** a task with `every day` due five days ago is completed today
- **THEN** its due date becomes tomorrow, with no occurrences generated for the missed days

#### Scenario: Short month
- **WHEN** a task with `every month` due 2027-01-31 is completed
- **THEN** its due date becomes 2027-02-28

### Requirement: Completion-relative rules
For a rule with `after completion`, the next occurrence SHALL be computed from the local calendar date on which the task was completed, not from the previous due date, and the due time SHALL be preserved.

#### Scenario: Every 3 days after completion
- **WHEN** a task with `every 3 days after completion` due Monday is completed on Wednesday
- **THEN** its due date becomes Saturday

#### Scenario: Completed early
- **WHEN** the same task is completed on the Sunday before its Monday due date
- **THEN** its due date becomes the following Wednesday

### Requirement: End conditions
A rule MAY end on a date (`until YYYY-MM-DD`) or after a number of completed occurrences (`for N times`). When the computed next occurrence is after the end date, or the number of completed occurrences of the series has reached N, completing the task SHALL complete it like a non-recurring task. Skipped occurrences SHALL not count towards N. The count SHALL be derived from the completed occurrence records so that it converges without a separate counter.

#### Scenario: Last occurrence
- **WHEN** a task with `every day until 2026-10-12` due 2026-10-12 is completed
- **THEN** the task gains a completion time and moves to Completed, and no further occurrence is scheduled

#### Scenario: Count reached on two devices
- **WHEN** two devices offline each complete the ninth occurrence of a `for 10 times` series, then sync
- **THEN** both show one ninth completion and the same tenth occurrence due, and the series ends after that tenth completion

### Requirement: Skip an occurrence
The user SHALL be able to skip the current occurrence from the detail panel and the keyboard. Skipping SHALL move the task to the next occurrence without creating a completed occurrence record and SHALL be an ordinary due-date change, so it works offline and converges by last-writer-wins.

#### Scenario: Skip this week
- **WHEN** the user skips a task with `every monday` due 2026-10-12
- **THEN** its due date becomes 2026-10-19 and nothing is added to Completed

#### Scenario: Skip on two devices
- **WHEN** two devices skip the same occurrence offline and sync
- **THEN** every device shows the task due on the same next occurrence, not two steps ahead

### Requirement: Series edits and detached occurrences
Edits to a recurring task's title, description, project, priority, labels, due time or rule SHALL apply to the series, because the series is the task. The detail panel SHALL offer "This occurrence only", which SHALL create a standalone copy of the task for the current occurrence (no rule, `series_id` set) and move the series to its next occurrence. The copy's id SHALL be derived from the series id and the occurrence date so concurrent detaching converges.

#### Scenario: Rename the series
- **WHEN** the user renames a recurring task
- **THEN** the next occurrence carries the new title after completion, with no prompt

#### Scenario: Detach and move one occurrence
- **WHEN** the user chooses "This occurrence only" on a task with `every monday` due 2026-10-12 and moves the copy to Tuesday
- **THEN** a standalone task due 2026-10-13 exists, and the series is due 2026-10-19 with its rule intact

#### Scenario: Detached on two devices offline
- **WHEN** two devices detach the same occurrence offline and sync
- **THEN** exactly one standalone copy exists on every device

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
Today, Upcoming and project views SHALL show a recurring task once, at its current occurrence, with a repeat indicator and the rule visible in the detail panel. Completed SHALL list each completed occurrence as its own entry. The detail panel SHALL show a preview of the next three occurrences, computed locally, and SHALL make the rule, skip and detach controls reachable with the keyboard.

#### Scenario: One row per series
- **WHEN** Upcoming is opened with a task due tomorrow that repeats daily
- **THEN** the task appears under Tomorrow only, with the repeat indicator

#### Scenario: Preview updates offline
- **WHEN** the device is offline and the user changes the rule in the detail panel
- **THEN** the next-three preview updates immediately
