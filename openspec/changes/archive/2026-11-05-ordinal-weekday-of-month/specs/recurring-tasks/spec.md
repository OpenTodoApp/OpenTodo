## MODIFIED Requirements

### Requirement: Rule grammar
The grammar SHALL be case-insensitive English of the form `every <pattern> [after completion] [until YYYY-MM-DD | for N times]` and SHALL be documented. Patterns SHALL include `day`, `N days`, `week`, `N weeks`, `weekday`, `month`, `N months`, `year`, one or more weekday names, a day of month (`15th`), `last day`, an ordinal weekday of the month (`1st weekday` to `4th weekday`, or `last weekday`: that Monday-to-Friday day of each month, counting only Monday to Friday), and an ordinal weekday (`2nd tuesday`, `last friday`). Ordinals SHALL be written as words (`first` to `fourth`, `last`) or with a suffix (`1st` to `4th`). Parsing SHALL produce one canonical lowercase form that is what gets stored, with ordinals in suffix form (`every first weekday` is stored as `every 1st weekday`).

#### Scenario: Canonical storage
- **WHEN** the user types `Every  2nd  Tuesday`
- **THEN** the stored rule is `every 2nd tuesday` and the preview shows the next three second Tuesdays

#### Scenario: Weekday list
- **WHEN** the user enters `every mon, wed, fri`
- **THEN** the rule is accepted and the next occurrence is the first of those weekdays after the current due date

#### Scenario: First and second weekday of the month
- **WHEN** a task with `every first weekday` is due 2026-02-02 and is completed, and a task with `every 2nd weekday` is due 2026-02-03 and is completed
- **THEN** the first is stored as `every 1st weekday` and becomes due Monday 2026-03-02, and the second becomes due Tuesday 2026-03-03, because 1 March 2026 is a Sunday and weekends are not counted

#### Scenario: Ordinal weekday of the month is a calendar pattern
- **WHEN** the user enters `every first weekday after completion` or `every 5th weekday`
- **THEN** the rule is rejected, while `every 4th weekday for 6 times` and `every first weekday until 2027-03-31` are accepted

#### Scenario: Same result on server and client
- **WHEN** the same rule and due date are evaluated by the server and by a client
- **THEN** both produce the same next occurrence date for every rule in the shared test vectors

## ADDED Requirements

### Requirement: Ordinal weekday of the month in calendars
A rule `every Nth weekday` SHALL be served to calendar clients as `RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=N` (N from 1 to 4, `-1` for `every last weekday`), and an inbound RRULE of that form, in any order of its parts and days, SHALL become that rule. Any other `BYSETPOS` SHALL stay outside the grammar. The rule is an ordinary field value: set offline it SHALL sync and converge by last-writer-wins like any rule.

#### Scenario: Served and read back
- **WHEN** a task with `every 2nd weekday` is fetched over CalDAV and the client sends `RRULE:FREQ=MONTHLY;BYSETPOS=2;BYDAY=FR,TH,WE,TU,MO` back
- **THEN** the task is served with `RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=2` and keeps the rule `every 2nd weekday`

#### Scenario: Unsupported position
- **WHEN** a client sends `RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=5`
- **THEN** the grammar cannot express it and the task is handled like any other unsupported RRULE
