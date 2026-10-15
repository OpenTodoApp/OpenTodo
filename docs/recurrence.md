---
title: Recurring task rules
summary: The repeat rule grammar, how the next date is worked out, and what completing, skipping and detaching do.
audience: user
section: Reference
specs: [recurring-tasks]
screens: []
order: 30
---
# Recurring task rules

A task can repeat. The rule is a short English phrase stored in the task's
`recurrence` field, for example `every weekday` or `every 3 days after completion`.
The same grammar is implemented by the server (`internal/recurrence`) and the
web app (`web/src/lib/recurrence.ts`), and both are tested against one shared file
of test vectors (`web/src/lib/recurrence.vectors.json`), so every device and the
REST API compute the same dates. Every example on this page is one of those vectors.

## Grammar

```
every <pattern> [after completion] [until YYYY-MM-DD | for N times]
```

Rules are case-insensitive and extra whitespace is ignored. A rule is at most 200
characters. What gets stored is the canonical form: lowercase, single spaces,
weekday names spelled out, ordinals with the correct suffix. `Every  2nd  Tuesday`
is stored as `every 2nd tuesday`.

| Pattern | Examples | Meaning |
| --- | --- | --- |
| day, N days | `every day`, `every 3 days` | Daily, or every N days (1–999). |
| week, N weeks | `every week`, `every 2 weeks` | Every 7 × N days. |
| weekday | `every weekday` | Monday to Friday. |
| month, N months | `every month`, `every 6 months` | Same day of month; a day the month does not have becomes its last day. |
| year, N years | `every year`, `every 2 years` | Same date; 29 February becomes 28 February in common years. |
| weekday names | `every monday`, `every mon, wed, fri`, `every tuesday and thursday` | Any set of weekdays, full names or three-letter abbreviations, separated by commas or "and". |
| day of month | `every 1st`, `every 15th`, `every 31st` | That day of each month; in shorter months the last day. |
| last day | `every last day` | The last day of each month. |
| last weekday | `every last weekday` | The last Monday–Friday of each month. |
| ordinal weekday | `every 2nd tuesday`, `every first monday`, `every last friday` | 1st/first to 4th/fourth or last of that weekday in each month. |

`every 2nd` is the 2nd day of each month; `every 2nd tuesday` is the second Tuesday.

### Completion-relative rules

Add `after completion` to a day, week, month or year interval to count from the
day the task is actually completed instead of from its due date:
`every 3 days after completion`, `every week after completion`. Calendar patterns
(weekdays, days of month, ordinals) cannot be completion-relative.

### End conditions

- `until YYYY-MM-DD`: no occurrence after that date, e.g. `every day until 2026-12-31`.
- `for N times`: the series has N occurrences in total, e.g. `every weekday for 10 times`.
  Skipped occurrences do not count.

Only one end condition per rule.

## How the next occurrence is computed

All dates are floating calendar dates (`YYYY-MM-DD`), like `due` itself; the
computation never converts through a time zone, so daylight saving changes have
no effect. The due time, if any, is kept.

A [deadline](tasks-and-projects.md#deadlines) on the series moves by the same
number of days as the due date: `every monday` due 12 October with the deadline
14 October is next due 19 October with the deadline 21 October, also when an
overdue series catches up. Skipping and "this occurrence only" move it the same
way. The completed occurrence and a detached copy keep the deadline they had.

- **Calendar rules**: the next occurrence is the first matching date strictly
  after the current due date. If that date is already in the past (the task was
  overdue), it is instead the first matching date after today: overdue tasks catch
  up rather than piling up, and no missed occurrences are generated. Interval rules
  keep their rhythm while catching up (`every 3 days` due on the 1st, completed on
  the 10th, moves to the 13th).
- **Completion-relative rules**: the next occurrence is counted from the local
  date of completion. `every 3 days after completion` due Monday and completed on
  Wednesday is next due Saturday; completed on the Sunday before, it is next due
  Wednesday.
- **Month ends**: `every month` due 31 January moves to 28 (or 29) February. The
  rule has no memory of the original day, so the following month is the 28th too;
  use `every 31st` or `every last day` to stay at the end of the month.
- A rule set on a task without a due date gives it one: the first matching date
  from today on.

## Completing, skipping and editing

- **Complete**: a completed copy of the current occurrence (the *occurrence
  record*) goes to Completed, and the task moves to its next occurrence. When the
  end condition is reached the task completes like any other task.
- **Skip** (`Shift+S`, or *Skip* in the detail panel): moves the task to the next
  occurrence without recording a completion. Completion-relative rules skip as if
  completed today. Skipping the last occurrence is not possible; complete or delete it.
- **This occurrence only** (`Shift+O`, or the button in the detail panel): makes a
  standalone copy of the current occurrence, without a rule, and moves the series
  to its next occurrence. Edit or move the copy freely.
- Every other edit (title, notes, project, priority, labels, due time, rule)
  applies to the series, because the series is the task.
- **Reopen** an occurrence record and it becomes a standalone open task; the series
  is not moved back. Reopening a series that ended keeps its rule, so its next
  completion continues the schedule.

## Sync and convergence

The rule is stored in `task.recurrence` and occurrence records point back with
`task.series_id` (see [sync.md](sync.md)). An occurrence record's id is derived
from the series id and the occurrence date (SHA-256, formatted as a UUID), and
the next due date is a pure function of the rule and dates every device shares.
Two devices that complete the same occurrence offline therefore write the same
record and the same next due date, and end with one Completed entry once they
sync. A `for N times` count is the number of occurrence records, so it converges
without a counter.

The REST API behaves the same: `PATCH /api/v1/tasks/{id}` with a non-null
`completed_at` on a recurring task records the occurrence and moves the task (see
[api.md](api.md)).

Clients older than this feature keep working: they store the new fields without
showing them and complete a recurring task as a plain completion, which is
recovered by reopening it on an updated device.
