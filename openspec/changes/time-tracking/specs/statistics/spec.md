# Spec Delta

## MODIFIED Requirements

### Requirement: What is counted
For a period the device SHALL count: completed (live tasks, including recurring occurrence records and subtasks, with `completed_at` in the period), created (`created_at` in the period; occurrence records are not new tasks), completed late (completed on a local day after the task's due date), slipped (a due date in the period before today and not completed by the period's end), and time tracked (the minutes of the user's own live time entries whose `started_at` falls in the period, a running entry counted to now, an entry belonging to the local day it started on). Overdue now SHALL be open live tasks due before today. The day an instant falls on, and "today", SHALL be the user's logical day.

#### Scenario: Recurring occurrences count
- **WHEN** an `every day` task was completed on five days of the week
- **THEN** completed counts five for that week, one per occurrence record

#### Scenario: Slipped and late
- **WHEN** a task due Tuesday is still open on Friday, and another due Tuesday was completed on Thursday
- **THEN** slipped counts the first and completed late counts the second, and both are shown with their project

#### Scenario: Time tracked this week
- **WHEN** the user tracked 50 minutes on Monday, 70 minutes on Wednesday and another member tracked 30 minutes on a shared task this week
- **THEN** time tracked reads 2 h for this week, the other member's entry counts nothing, and both devices of the user show the same figure offline

#### Scenario: Entry across midnight
- **WHEN** an entry started on Sunday at 23:30 and ended on Monday at 00:30, and the week starts on Monday
- **THEN** its 60 minutes count for Sunday's week, not Monday's

#### Scenario: Completed after midnight is not late
- **WHEN** the day start is `04:00` and a task due Wednesday 14 October is completed at 01:30 on Thursday 15 October
- **THEN** it counts as completed on Wednesday, not late, and the per-day chart adds it to Wednesday's bar

#### Scenario: Same rows, same numbers
- **WHEN** two synced devices of the same user open Statistics for last week
- **THEN** they show identical numbers, because the day start is part of the synced row and the completions are the same instants

### Requirement: Breakdowns and charts
The Statistics screen SHALL show completions per day of the period (up to 4 weeks), per week and per weekday (for 4 and 12 weeks) and per project (the five projects with most completions and "other"), and, when the period holds tracked time, time tracked per day (up to 4 weeks) and per project (the five projects with most time and "other", tasks without a project as "Inbox"), each as a chart with an accessible text alternative (a table or list carrying the same values) and no library-rendered image. The charts SHALL respect light and dark themes and SHALL use no colour alone to convey a value. Durations SHALL read as hours and minutes.

#### Scenario: Per-day chart
- **WHEN** this week is shown on Wednesday
- **THEN** the per-day chart has one bar per day from the week start to today, each with its count readable by a screen reader

#### Scenario: Project breakdown
- **WHEN** the user completed tasks in seven projects in the last 4 weeks
- **THEN** five projects are named with their counts and the rest is summed as "other", in descending order

#### Scenario: Tracked per day and per project
- **WHEN** this week holds entries on tasks of "Client A" (3 h) and the Inbox (40 m)
- **THEN** a "Tracked per day" chart shows the minutes per day with a text alternative, and "Tracked per project" lists "Client A 3h" and "Inbox 40m"

#### Scenario: Nothing tracked
- **WHEN** the chosen period holds no time entry
- **THEN** the tracked charts are not shown and the time tracked figure reads 0

## ADDED Requirements

### Requirement: Time entries export
The Statistics screen SHALL offer "Export time entries" in the menu beside the period chooser (after it, so the period chooser stays the first focusable control), producing the CSV defined by the time-tracking capability for the chosen period from local data, so it works offline and matches the server's CSV for the same entries. Nothing SHALL be sent to produce it.

#### Scenario: Export the last 4 weeks
- **WHEN** the user chooses the last 4 weeks and Export time entries
- **THEN** a `time-entries-<start>-<end>.csv` download starts with one row per entry of the period, and no request leaves the device

#### Scenario: Encrypted account
- **WHEN** an encrypted account exports its entries from Statistics
- **THEN** task titles, project names, labels and notes are the decrypted values, since the device holds the key
