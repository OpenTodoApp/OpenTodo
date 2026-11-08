## ADDED Requirements

### Requirement: Rules a 1.0 client reads
Every writer of a rule (quick add, the repeat field, REST, the AI assistant tools, CalDAV, the importer, the Markdown vault and a series split) SHALL store a rule in the form a 1.0 client reads whenever one gives the same dates: `every N weeks on` a single weekday, for a task whose due date at write time falls on that weekday, SHALL be stored as `every N weeks`, with its `until` or `for N times` end. A rule on several weekdays with N above 1, on a weekday the due date is not on, or on a task without a due date SHALL keep the `every N weeks on` form. The web app and the Go server SHALL do this through one function each, checked against shared vectors, so the stored rule is the same whichever device or route writes it; it is computed locally from the write's own fields, works offline and converges like any rule.

#### Scenario: Every other Saturday due on a Saturday
- **WHEN** a task due Saturday 2026-11-07 gets the rule `every 2 weeks on saturday`
- **THEN** the stored rule is `every 2 weeks`, and completing the task makes it due 2026-11-21

#### Scenario: Due date on another weekday
- **WHEN** a task due Wednesday 2026-11-04 gets the rule `every 2 weeks on saturday`
- **THEN** the stored rule is `every 2 weeks on saturday`

#### Scenario: CalDAV rule on its start date
- **WHEN** a CalDAV client sends a VTODO with `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA` whose DTSTART or DUE is Saturday 2026-11-07
- **THEN** the stored rule is `every 2 weeks`

#### Scenario: Several weekdays
- **WHEN** a task due Monday 2026-11-02 gets the rule `every 3 weeks on monday, thursday`
- **THEN** the stored rule is `every 3 weeks on monday, thursday`
