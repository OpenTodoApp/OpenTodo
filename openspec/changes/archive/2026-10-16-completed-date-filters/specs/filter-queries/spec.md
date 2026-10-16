# Spec Delta

## MODIFIED Requirements

### Requirement: Date terms
`due` and `created` SHALL accept `<`, `<=`, `=`, `>=`, `>`, `before` and `after` against a date expression: `today`, `tomorrow`, `yesterday`, a weekday name (next occurrence including today), an ISO date, `N days` / `N days ago`, or a period (see "Period date expressions"). Comparisons SHALL use the viewer's local calendar date; a task without a due date SHALL never match a `due` comparison. `no date`, `overdue`, `today` and `tomorrow` SHALL be keywords.

#### Scenario: Due by tomorrow
- **WHEN** today is 2026-10-10 and the user enters `due <= tomorrow`
- **THEN** open tasks due on or before 2026-10-11 are listed, including overdue ones, and tasks without a due date are not

#### Scenario: Weekday expression
- **WHEN** today is Saturday 2026-10-10 and the user enters `due = friday`
- **THEN** tasks due on 2026-10-16 are listed

#### Scenario: Relative creation date
- **WHEN** the user enters `created > 7 days ago & no date`
- **THEN** tasks created within the last seven days that have no due date are listed

### Requirement: Priority, state and search terms
`p1` to `p4` SHALL match the task priority. `completed` SHALL include completed tasks and `open` only open ones; a query without either, and without a `completed` date term, SHALL match open tasks only. `subtask` SHALL match tasks that have a parent. `search: text` SHALL match tasks whose title or description contains the text ignoring case, with quotes allowed for several words. Deleted tasks SHALL never match any query.

#### Scenario: Default to open tasks
- **WHEN** the user enters `p1`
- **THEN** only open priority-1 tasks are listed, and `p1 & completed` lists only completed ones

#### Scenario: Text search
- **WHEN** the user enters `search: "oat milk"`
- **THEN** tasks whose title or description contains "oat milk" in any letter case are listed

#### Scenario: A completion date term includes completed tasks
- **WHEN** the user enters `#Work & completed >= this week`
- **THEN** the tasks of "Work" completed this week are listed, although the query has no `completed` or `open` keyword

## ADDED Requirements

### Requirement: Period date expressions
`this|last|next week`, `this|last|next month`, `N weeks ago` and `N months ago` SHALL be ranges of days in every date term; weeks SHALL start on the user's first day of the week, months SHALL be calendar months, and a day SHALL be a one-day range. Against a range, `=` SHALL match days within it, `<` days before it, `<=` up to its end, `>` after it and `>=` from its start. Stored queries SHALL keep the period; evaluation SHALL stay on the device and agree across the user's devices.

#### Scenario: This week with a Monday start
- **WHEN** the first day of the week is Monday, today is Friday 2026-10-16 and the user enters `due = this week`
- **THEN** open tasks due from 2026-10-12 to 2026-10-18 are listed

#### Scenario: This week with a Sunday start
- **WHEN** the first day of the week is Sunday, today is Friday 2026-10-16 and the user enters `due = this week`
- **THEN** open tasks due from 2026-10-11 to 2026-10-17 are listed

#### Scenario: Comparisons against a period
- **WHEN** today is 2026-10-16 and the user enters `due >= last month & due < this month`
- **THEN** open tasks due from 2026-09-01 to 2026-09-30 are listed, and `due <= last month` also lists those due earlier

#### Scenario: Month boundaries
- **WHEN** today is 2026-03-31 and the user enters `created = last month`
- **THEN** tasks created from 2026-02-01 to 2026-02-28 in the viewer's zone are listed, and `created = 2 months ago` covers 2026-01-01 to 2026-01-31

#### Scenario: Saved period view offline
- **WHEN** a view with the query `deadline = next week` is saved on one device and another device opens it while offline a week later
- **THEN** the second device lists tasks whose deadline falls in the week after its current week, from local data

### Requirement: Completion date terms
`completed` followed by a comparison and a date expression SHALL compare the viewer's local calendar day of the task's completion time, with the same expressions and range rules as the other date terms; without a comparison `completed` SHALL remain the state keyword. An open task SHALL never match it; completed occurrences of recurring tasks SHALL match. Evaluation SHALL stay on the device from local data and follow synced completions and reopenings.

#### Scenario: What I did last week
- **WHEN** the first day of the week is Monday, today is 2026-10-16 and the user enters `completed = last week`
- **THEN** tasks completed from Monday 2026-10-05 00:00 to Sunday 2026-10-11 23:59 in the viewer's zone are listed, and open tasks are not

#### Scenario: Last seven days
- **WHEN** the user enters `completed >= 7 days ago & #Home`
- **THEN** tasks of "Home" completed on any of the last seven days or today are listed

#### Scenario: Reopened on another device
- **WHEN** `completed >= this month` is displayed and another device reopens one of the listed tasks, then this device syncs
- **THEN** the task leaves the results without a reload

#### Scenario: Missing comparison value
- **WHEN** the user enters `completed after`
- **THEN** the message reads `Expected a date after "after" at position 11`
