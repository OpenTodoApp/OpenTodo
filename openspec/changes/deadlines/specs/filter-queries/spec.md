# Spec Delta

## ADDED Requirements

### Requirement: Deadline terms
`deadline` SHALL accept the same comparisons and date expressions as `due` (`<`, `<=`, `=`, `>=`, `>`, `before`, `after` against `today`, `tomorrow`, `yesterday`, a weekday name, an ISO date, `N days` or `N days ago`), compared on the viewer's local calendar date. A task without a deadline SHALL never match a `deadline` comparison. `no deadline` SHALL be a keyword matching tasks without one. Evaluation SHALL stay on the device, from local data, with no network request.

#### Scenario: Deadlines in the next three days
- **WHEN** today is 2026-10-14 and the user enters `deadline <= 3 days`
- **THEN** open tasks with a deadline on or before 2026-10-17 are listed, including ones whose deadline has passed, and tasks without a deadline are not

#### Scenario: No deadline
- **WHEN** the user enters `#Work & no deadline`
- **THEN** open tasks of "Work" without a deadline are listed

#### Scenario: Deadline but no plan
- **WHEN** the user enters `deadline >= today & no date`
- **THEN** open tasks with a deadline today or later that have no due date are listed

#### Scenario: Saved view syncs and evaluates offline
- **WHEN** a view with the query `deadline <= 7 days` is saved on one device and another device opens it while offline
- **THEN** the second device lists its matching tasks from local data and shows a live count in the sidebar
