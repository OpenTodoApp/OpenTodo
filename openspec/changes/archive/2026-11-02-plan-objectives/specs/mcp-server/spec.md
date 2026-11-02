## ADDED Requirements

### Requirement: Objectives in reads
`tools/list` SHALL advertise a read-only `list_objectives` tool that takes an optional `period` (a quarter or an ISO week) and an optional `timezone`. By default it returns the current quarter's and current week's objectives in that time zone, with Monday weeks. `resources/list` SHALL expose `opentodo://objectives` built from the same read. Each result SHALL carry `id`, `period`, `position`, `done` and `done_at`, with the `title` inside the untrusted-text marking. Deleted objectives SHALL be excluded. The tool SHALL write nothing and reflect only data devices have synced. No write tool for objectives SHALL be advertised. An invalid `period` SHALL be a `-32602` error naming the argument.

#### Scenario: Current objectives
- **WHEN** an assistant calls `list_objectives` with `timezone: "Europe/Rome"` on 2026-10-28
- **THEN** the result lists the open and done objectives of `2026-Q4` and `2026-W44`, titles marked as untrusted text

#### Scenario: Invalid period
- **WHEN** an assistant calls `list_objectives` with `period: "Q4"`
- **THEN** the response is a `-32602` error naming `period`
