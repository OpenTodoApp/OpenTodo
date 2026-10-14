# Spec Delta

## ADDED Requirements

### Requirement: Start, Someday and evening terms
`someday` SHALL match parked tasks, `deferred` tasks whose start date is after the viewer's local date, and `evening` tasks with the evening flag. `start` SHALL accept the comparisons and date expressions of `due`, compared on the viewer's local calendar date; a task without a start date (null or Someday) SHALL never match a `start` comparison. `no start` SHALL match tasks with a null start. Queries SHALL keep matching parked and deferred tasks unless a term excludes them, and SHALL be evaluated on the device from local data.

#### Scenario: Waiting-for list without parked tasks
- **WHEN** the user enters `@waiting & !someday`
- **THEN** open tasks labelled "waiting" that are not parked are listed, including deferred ones

#### Scenario: Starting this week
- **WHEN** today is 2026-10-14 and the user enters `deferred & start <= 6 days`
- **THEN** open tasks with a start date from 2026-10-15 to 2026-10-20 are listed, and parked tasks are not

#### Scenario: Evening tasks in a project
- **WHEN** the user enters `#Home & evening`
- **THEN** open tasks of "Home" with the evening flag are listed, whatever their date

#### Scenario: Saved view offline
- **WHEN** a view with the query `someday & #Ideas` is opened on a device that is offline
- **THEN** the parked tasks of "Ideas" are listed from local data and the sidebar shows their count
