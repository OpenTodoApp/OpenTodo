# Spec Delta

## MODIFIED Requirements

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
