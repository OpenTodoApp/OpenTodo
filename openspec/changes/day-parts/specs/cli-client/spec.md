# Spec Delta

## ADDED Requirements

### Requirement: Part of the day in the CLI
`ot add` and `ot edit` SHALL accept `--part morning|afternoon|evening|none`, writing the part as OpenSpec `day-parts` pairs it; another value SHALL be a usage error that writes nothing. `ot show` and `--json` output SHALL carry `day_part`. Quick-add parsing in the CLI SHALL follow the user's Day parts preference.

#### Scenario: Set Afternoon
- **WHEN** the user runs `ot edit 8c2a --part afternoon` on an evening task
- **THEN** the task's part is Afternoon and its evening flag is false

#### Scenario: Invalid part
- **WHEN** the user runs `ot add "Stretch" --part night`
- **THEN** the command exits with a usage error and creates nothing
