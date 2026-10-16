# Spec Delta

## ADDED Requirements

### Requirement: List by completion date
`ot list` SHALL accept `--completed-after` and `--completed-before`, each a `YYYY-MM-DD` date (the start of that day in the local time zone), an RFC 3339 time or Unix milliseconds. With either, it SHALL list only completed tasks whose completion time falls in `[after, before)`, most recent first, combinable with `--project` and `--limit`. Like every command it needs a connection and the stored token, and it shows only what devices have synced.

#### Scenario: Last week
- **WHEN** the user runs `ot list --completed-after 2026-10-05 --completed-before 2026-10-12`
- **THEN** the tasks completed in that week are printed, most recent first

#### Scenario: Invalid date
- **WHEN** the user runs `ot list --completed-after lastweek`
- **THEN** the command exits with code 2 and names the flag and the accepted forms
