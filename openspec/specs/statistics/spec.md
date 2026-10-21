# statistics Specification

## Purpose
What a user completed, created and let slip over a period, computed on the device from the data it already holds, shown as numbers and small charts, without sending anything to the server.

## Requirements

### Requirement: Statistics are computed on the device
Statistics SHALL be derived from the device's local task and project rows at the time they are shown. The device SHALL send nothing to the server to compute them, SHALL write nothing (no op, no cache that syncs), and SHALL show them offline. Because every device holds the same rows after sync, every device SHALL show the same numbers for the same period; there is nothing to converge.

#### Scenario: Offline
- **WHEN** the user opens Statistics without a connection
- **THEN** the numbers and charts are shown from local data with no offline notice and no request is attempted

#### Scenario: Two devices agree
- **WHEN** two synced devices open Statistics for last week
- **THEN** they show identical counts, charts and project breakdowns

#### Scenario: No request
- **WHEN** Statistics is opened and used for a period
- **THEN** no request other than ordinary sync leaves the device and the server holds no statistics

### Requirement: Periods and week start
Statistics SHALL be shown for one of: this week, last week, the last 4 weeks and the last 12 weeks, default this week. A week SHALL start on the user's first day of the week preference and days SHALL be the user's logical days (OpenSpec `date-time-preferences`, "Logical today"): the device's local calendar days, each beginning at the user's day start instead of midnight. Week boundaries SHALL be the same as those of the filter periods `this week` and `last week`. The period is `[start, end)`; for the current week the end is now.

#### Scenario: Sunday start
- **WHEN** the first day of the week is Sunday and today is Wednesday 2026-10-14
- **THEN** "this week" covers 2026-10-11 up to now and "last week" covers 2026-10-04 to 2026-10-10

#### Scenario: Twelve weeks
- **WHEN** the user picks the last 12 weeks
- **THEN** the period covers the 11 full weeks before the current one plus the current week to now, and the per-week chart has 12 bars

#### Scenario: Week end at the day start
- **WHEN** the first day of the week is Monday, the day start is `04:00` and it is 02:00 on Monday 2026-10-19
- **THEN** "this week" is still the week of 2026-10-12 and a task completed now counts in it, not in the next week

### Requirement: What is counted
For a period the device SHALL count: completed (live tasks, including recurring occurrence records and subtasks, with `completed_at` in the period), created (`created_at` in the period; occurrence records are not new tasks), completed late (completed on a local day after the task's due date), and slipped (a due date in the period before today and not completed by the period's end). Overdue now SHALL be open live tasks due before today. The day an instant falls on, and "today", SHALL be the user's logical day.

#### Scenario: Recurring occurrences count
- **WHEN** an `every day` task was completed on five days of the week
- **THEN** completed counts five for that week, one per occurrence record

#### Scenario: Slipped and late
- **WHEN** a task due Tuesday is still open on Friday, and another due Tuesday was completed on Thursday
- **THEN** slipped counts the first and completed late counts the second, and both are shown with their project

#### Scenario: Completed after midnight is not late
- **WHEN** the day start is `04:00` and a task due Wednesday 14 October is completed at 01:30 on Thursday 15 October
- **THEN** it counts as completed on Wednesday, not late, and the per-day chart adds it to Wednesday's bar

#### Scenario: Same rows, same numbers
- **WHEN** two synced devices of the same user open Statistics for last week
- **THEN** they show identical numbers, because the day start is part of the synced row and the completions are the same instants

### Requirement: Excluded rows
Tasks in the Trash SHALL be excluded from every statistic, and a habit's skipped occurrence SHALL NOT count anywhere, because it is not a completion.

#### Scenario: Trashed task excluded
- **WHEN** a task completed on Monday is moved to the Trash on Tuesday
- **THEN** it no longer counts as completed for that week, and counts again if restored

#### Scenario: Skipped habit occurrence
- **WHEN** a habit was done on four days of the week and skipped on a fifth
- **THEN** completed counts four for that week and the skipped day is in no number

### Requirement: Whose tasks count in shared projects
In a shared project a completed task SHALL count for the account that completed it. When the task does not record who completed it (completed before that was recorded, or ticked on a public link), and for open tasks, it SHALL count for its assignee, or for the user when it is unassigned.

#### Scenario: Shared project tasks
- **WHEN** a shared project holds a task completed by the user but assigned to another member, a task completed by another member but assigned to the user, and older completed tasks that do not record who completed them
- **THEN** the first counts and the second does not, because who completed a task decides; of the older tasks, those assigned to the user or unassigned count and those assigned to another member do not

### Requirement: Breakdowns and charts
The Statistics screen SHALL show completions per day of the period (up to 4 weeks), per week and per weekday (for 4 and 12 weeks) and per project (the five projects with most completions and "other"), each as a chart with an accessible text alternative (a table or list carrying the same values) and no library-rendered image. The charts SHALL respect light and dark themes and SHALL use no colour alone to convey a value.

#### Scenario: Per-day chart
- **WHEN** this week is shown on Wednesday
- **THEN** the per-day chart has one bar per day from the week start to today, each with its count readable by a screen reader

#### Scenario: Project breakdown
- **WHEN** the user completed tasks in seven projects in the last 4 weeks
- **THEN** five projects are named with their counts and the rest is summed as "other", in descending order

### Requirement: Encrypted accounts
For an account with end-to-end encryption the device SHALL compute statistics from the plaintext scheduling fields alone and SHALL show project names decrypted on the device, as every list does. Nothing about the statistics SHALL leave the device.

#### Scenario: Encrypted account
- **WHEN** an encrypted account opens Statistics
- **THEN** every number is present and the project breakdown shows decrypted names, or the "cannot decrypt" placeholder for a name the device cannot decrypt

### Requirement: Statistics screen
The web app SHALL show Statistics at `/stats`, reachable from the sidebar and by keyboard, with the period chooser as the first focusable control and the numbers before the charts. Below 640 px the charts SHALL stack. The screen SHALL explain in one line that everything is computed on this device.

#### Scenario: Keyboard
- **WHEN** the user presses `g` then `Shift+S`, then Tab and the arrow keys
- **THEN** Statistics opens, the period chooser receives focus and the arrow keys change the period

#### Scenario: Empty history
- **WHEN** an account has completed nothing in the chosen period
- **THEN** the screen shows zeros and a short hint instead of empty charts
