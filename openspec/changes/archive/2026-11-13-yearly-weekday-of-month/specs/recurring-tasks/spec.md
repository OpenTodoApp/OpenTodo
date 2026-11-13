## MODIFIED Requirements

### Requirement: Rule grammar
The grammar SHALL be case-insensitive English of the form `every <pattern> [after completion] [until YYYY-MM-DD | for N times]` and SHALL be documented. Patterns SHALL include `day`, `N days`, `week`, `N weeks`, `N weeks on` one or more weekday names (`every 2 weeks on saturday`), `weekday`, `month`, `N months`, `year`, one or more weekday names, a day of month (`15th`), `last day`, an ordinal weekday of the month (`1st weekday` to `4th weekday`, or `last weekday`: that Monday-to-Friday day of each month, counting only Monday to Friday), an ordinal weekday (`2nd tuesday`, `last friday`), and an ordinal weekday of a month (`last sunday of march`, `4th thursday in november`: that weekday once a year in that month, `of` or `in`, full month names or their first three letters, stored with `of` and the full name). Ordinals SHALL be written as words (`first` to `fourth`, `last`) or with a suffix (`1st` to `4th`). Parsing SHALL produce one canonical lowercase form that is what gets stored, with ordinals in suffix form (`every first weekday` is stored as `every 1st weekday`, `every week on tue` as `every tuesday`). `N weeks on` weekdays SHALL be a calendar pattern, never completion-relative. A rule is a string field, so it works offline and converges by the field's last-writer-wins like any other.

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

#### Scenario: A weekday of one month every year
- **WHEN** a task due on 28 March 2027 has the rule `every last Sunday in March` and is completed on time
- **THEN** the stored rule is `every last sunday of march` and the next due date is 26 March 2028, the last Sunday of March that year

#### Scenario: Shared with calendars and imports
- **WHEN** a CalDAV client sends `FREQ=YEARLY;BYMONTH=11;BYDAY=4TH`, or a Todoist export has `every 4th Thursday of November`
- **THEN** the task's rule is `every 4th thursday of november`, and the same rule is served back as that RRULE
