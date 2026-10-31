# Spec Delta

## ADDED Requirements

### Requirement: Part of the day in agent tools
`create_tasks` items and `update_tasks` updates SHALL accept `day_part` (`morning`, `afternoon`, `evening` or null), written through the server's strict apply path as OpenSpec `day-parts` pairs it with the evening flag; another value SHALL be a tool error that writes nothing. Task results and `opentodo://` task resources SHALL carry `day_part` (`morning`, `afternoon` or null) beside `evening`.

#### Scenario: Plan a morning habit
- **WHEN** an assistant with write access calls `update_tasks` with `day_part: "morning"` on an evening habit
- **THEN** the habit's part is Morning, its evening flag is false, and `get_task` returns `day_part: "morning"`, `evening: false`

#### Scenario: Unknown part
- **WHEN** an assistant passes `day_part: "night"`
- **THEN** the tool returns an error and nothing is written
