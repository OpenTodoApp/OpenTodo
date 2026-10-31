## ADDED Requirements

### Requirement: Running Focus session in reads
Each entry in `list_time_entries` results SHALL carry `focus: {mode, session, planned_end_at}` or `null` for an entry without Focus details. `resources/list` SHALL expose `opentodo://time-entries/running`, whose content is `{entry, server_time}` with the caller's own running entry (task title under `untrusted_text`) or `null`. An entry on a task of a project kept away from AI assistants SHALL be left out, so the resource reads `null` as when nothing runs.

#### Scenario: Assistant reads the session
- **WHEN** an assistant reads `opentodo://time-entries/running` during the user's third Pomodoro planned to end at 10:25
- **THEN** the content holds the entry with `focus: {"mode":"pomodoro","session":3,"planned_end_at":<10:25>}` and `server_time`

#### Scenario: Session on an excluded project
- **WHEN** the running entry's task belongs to a project kept away from AI assistants
- **THEN** the resource reads `entry: null` and `list_time_entries` leaves the entry out

#### Scenario: Plain timer
- **WHEN** the running entry was started with the Start button or an agent's `start_timer`
- **THEN** the entry is returned with `focus: null`
