## ADDED Requirements

### Requirement: Time sector flags
`ot add` and `ot edit` SHALL accept `--sector`, with one of these values:
- `this-week`, `next-week`, `this-month`, `next-month`, `this-quarter` or `next-quarter`, resolved on the client with the profile's week start (Monday when unset);
- an absolute period (OpenSpec `time-sectors`);
- `none`, which clears the sector.

`ot list` SHALL accept `--sector` with the same values or `carried` as a filter. The table SHALL append the relative name to the `DUE` cell. `--json` output SHALL carry `sector` on every task, and the `task` schema of `ot schema` SHALL describe it within output version 1. An invalid value SHALL exit with the usage error code, naming the value, and write nothing.

#### Scenario: Add for next week
- **WHEN** the user runs `ot add "Book the venue" --sector next-week` on 2026-10-28
- **THEN** the task is created with the sector `2026-W45`, and `ot list --sector next-week` prints it with `next week` in the DUE cell

#### Scenario: Invalid value
- **WHEN** the user runs `ot edit <id> --sector soon`
- **THEN** the command exits with the usage error code naming `soon` and the task is unchanged

#### Scenario: Schema lists the field
- **WHEN** an agent runs `ot schema --json`
- **THEN** the `task` schema lists `sector` and the `add`, `edit` and `list` commands list `--sector`
