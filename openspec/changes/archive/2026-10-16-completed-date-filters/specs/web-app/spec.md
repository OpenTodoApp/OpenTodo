# Spec Delta

## MODIFIED Requirements

### Requirement: Standard views
The client SHALL provide Inbox (open tasks without a project), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks).

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

## ADDED Requirements

### Requirement: Completed logbook
The Completed view SHALL list completed tasks newest first, grouped by the local day of completion ("Today", "Yesterday", then weekday and date, with the year outside the current year), each group with its count. It SHALL render the newest 100 and offer a keyboard-reachable "Show more" that renders the next 100, with no fixed cap. It SHALL be computed from local data, work offline and follow synced completions and reopenings.

#### Scenario: Grouped by day
- **WHEN** the user completed two tasks today, one yesterday and one on Monday 2026-10-12, and today is Friday 2026-10-16
- **THEN** Completed shows "Today" with two tasks, "Yesterday" with one, then a heading for Monday 12 October with one

#### Scenario: Older history is reachable
- **WHEN** the user has 250 completed tasks and opens Completed
- **THEN** the newest 100 are listed with "Show more" naming 150 more, and pressing it twice lists all 250

#### Scenario: Offline and synced
- **WHEN** the device is offline, the user completes a task, and later another device's completion syncs in
- **THEN** each appears under its completion day without a reload, and reopening a task removes it from its group
