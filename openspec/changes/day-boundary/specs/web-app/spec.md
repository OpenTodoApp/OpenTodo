# Spec Delta

## MODIFIED Requirements

### Requirement: Standard views
The client SHALL provide Inbox (open tasks without a project), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks). "Today" in these views is the user's logical today (OpenSpec `date-time-preferences`, "Logical today"): the calendar date, or the previous one while the local time is before the user's day start.

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

#### Scenario: Today after midnight with a day start
- **WHEN** the user's day start is `04:00`, it is 01:30 on Thursday, and tasks are due on Wednesday and on Thursday
- **THEN** Today lists Wednesday's tasks under "Today" and none under "Overdue", and Upcoming lists Thursday's under "Tomorrow"

### Requirement: Completed logbook
The Completed view SHALL list completed tasks newest first, grouped by the logical day of completion ("Today", "Yesterday", then weekday and date, with the year outside the current year), each group with its count. It SHALL render the newest 100 and offer a keyboard-reachable "Show more" that renders the next 100, with no fixed cap. It SHALL be computed from local data, work offline and follow synced completions and reopenings.

#### Scenario: Grouped by day
- **WHEN** the user completed two tasks today, one yesterday and one on Monday 2026-10-12, and today is Friday 2026-10-16
- **THEN** Completed shows "Today" with two tasks, "Yesterday" with one, then a heading for Monday 12 October with one

#### Scenario: Older history is reachable
- **WHEN** the user has 250 completed tasks and opens Completed
- **THEN** the newest 100 are listed with "Show more" naming 150 more, and pressing it twice lists all 250

#### Scenario: Offline and synced
- **WHEN** the device is offline, the user completes a task, and later another device's completion syncs in
- **THEN** each appears under its completion day without a reload, and reopening a task removes it from its group

#### Scenario: Completed after midnight with a day start
- **WHEN** the user's day start is `04:00` and a task was completed at 01:30 on Thursday 15 October
- **THEN** Completed lists it under Wednesday 14 October, and under "Today" while Wednesday is still the logical today

### Requirement: Date-dependent views follow the clock
Today, Upcoming, Anytime, the Logbook headings, the habit streaks and the sidebar counts SHALL move to the new day within a minute of the user's day start (local midnight by default; and on a change of time zone or of the day start preference) while the app stays open, without a reload or a data change. This is local: it works offline, and no operation is written.

#### Scenario: Midnight with the app open
- **WHEN** the app shows Today at 23:58 and a task is due tomorrow
- **THEN** shortly after midnight the task is listed in Today and the sidebar's Today count includes it

#### Scenario: Day start with the app open
- **WHEN** the user's day start is `04:00`, the app shows Today at 03:58 on Thursday and a task is due on Thursday
- **THEN** at midnight nothing moves, and shortly after 04:00 the task is listed in Today and the sidebar's Today count includes it

#### Scenario: Preference synced in while open
- **WHEN** the app shows Today at 01:30 and the day start changes from `00:00` to `04:00` on another device, which syncs
- **THEN** Today re-groups to the previous day's tasks without a reload
