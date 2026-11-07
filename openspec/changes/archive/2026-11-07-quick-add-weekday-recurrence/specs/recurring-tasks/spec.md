## MODIFIED Requirements

### Requirement: Rule grammar
The grammar SHALL be case-insensitive English of the form `every <pattern> [after completion] [until YYYY-MM-DD | for N times]` and SHALL be documented. Patterns SHALL include `day`, `N days`, `week`, `N weeks`, `N weeks on` one or more weekday names (`every 2 weeks on saturday`), `weekday`, `month`, `N months`, `year`, one or more weekday names, a day of month (`15th`), `last day`, an ordinal weekday of the month (`1st weekday` to `4th weekday`, or `last weekday`: that Monday-to-Friday day of each month, counting only Monday to Friday), and an ordinal weekday (`2nd tuesday`, `last friday`). Ordinals SHALL be written as words (`first` to `fourth`, `last`) or with a suffix (`1st` to `4th`). Parsing SHALL produce one canonical lowercase form that is what gets stored, with ordinals in suffix form (`every first weekday` is stored as `every 1st weekday`, `every week on tue` as `every tuesday`). `N weeks on` weekdays SHALL be a calendar pattern, never completion-relative. A rule is a string field, so it works offline and converges by the field's last-writer-wins like any other.

#### Scenario: Canonical storage
- **WHEN** the user types `Every  2nd  Tuesday`
- **THEN** the stored rule is `every 2nd tuesday` and the preview shows the next three second Tuesdays

#### Scenario: Weekday list
- **WHEN** the user enters `every mon, wed, fri`
- **THEN** the rule is accepted and the next occurrence is the first of those weekdays after the current due date

#### Scenario: Week interval on a weekday
- **WHEN** the user enters `every 2 weeks on sat`, `every 3 weeks on mon and thu` or `every week on tuesday`
- **THEN** the stored rules are `every 2 weeks on saturday`, `every 3 weeks on monday, thursday` and `every tuesday`, while `every 2 weeks on saturday after completion` and `every 2 months on monday` are rejected

#### Scenario: First and second weekday of the month
- **WHEN** a task with `every first weekday` is due 2026-02-02 and is completed, and a task with `every 2nd weekday` is due 2026-02-03 and is completed
- **THEN** the first is stored as `every 1st weekday` and becomes due Monday 2026-03-02, and the second becomes due Tuesday 2026-03-03, because 1 March 2026 is a Sunday and weekends are not counted

#### Scenario: Ordinal weekday of the month is a calendar pattern
- **WHEN** the user enters `every first weekday after completion` or `every 5th weekday`
- **THEN** the rule is rejected, while `every 4th weekday for 6 times` and `every first weekday until 2027-03-31` are accepted

#### Scenario: Same result on server and client
- **WHEN** the same rule and due date are evaluated by the server and by a client
- **THEN** both produce the same next occurrence date for every rule in the shared test vectors

### Requirement: Next occurrence for calendar rules
For a rule without `after completion`, the next occurrence SHALL be the first date matching the pattern strictly after the current due date that is not an exception date of the series (see "Exceptions come from the records"). If that date is already in the past, the next occurrence SHALL instead be the first matching date after today that is not an exception date, so overdue recurring tasks catch up rather than pile up. Day-of-month patterns that do not exist in a month SHALL use that month's last day. For `every N weeks on` weekdays, a matching date SHALL be one of the weekdays in a week (Monday to Sunday) that is a multiple of N weeks from the week of the current due date, also while catching up, the same dates as an iCalendar `FREQ=WEEKLY;INTERVAL=N;BYDAY` rule with the due date as its start; a due date on another weekday SHALL count as an occurrence of its own. A task without a due date that gets such a rule SHALL be due on the nearest of its weekdays from today on. The due time, if any, SHALL be preserved. Every device and the server SHALL compute the same dates offline from the rule and the due date.

#### Scenario: Every last weekday of the month
- **WHEN** a task with `every last weekday` due Friday 2026-10-30 is completed
- **THEN** its due date becomes Monday 2026-11-30

#### Scenario: Catch up after being overdue
- **WHEN** a task with `every day` due five days ago is completed today
- **THEN** its due date becomes tomorrow, with no occurrences generated for the missed days

#### Scenario: Short month
- **WHEN** a task with `every month` due 2027-01-31 is completed
- **THEN** its due date becomes 2027-02-28

#### Scenario: Jump over an exception
- **WHEN** a task with `every day` due the 12th has a skipped record for the 13th and is completed
- **THEN** its due date becomes the 14th

#### Scenario: Every other Saturday from a Wednesday
- **WHEN** a task with `every 2 weeks on saturday` due Wednesday 2026-11-04 is completed, and then completed again
- **THEN** its due date becomes Saturday 2026-11-07, then Saturday 2026-11-21

#### Scenario: Week interval keeps its phase while catching up
- **WHEN** a task with `every 2 weeks on saturday` due 2026-11-07 is completed on Sunday 2026-12-06
- **THEN** its due date becomes Saturday 2026-12-19, not 2026-12-12
