## ADDED Requirements

### Requirement: Multi-day flag in task lines
A task drawn as a span (OpenSpec `multi-day-tasks`) SHALL carry the inline field `[span:: true]` written directly after the place of `[evening:: true]` in the vault's field order; the range is the line's `🛫` and `📅` dates. The vault SHALL read the field in any order, `[span:: false]` or its absence clearing the flag when the line changes, and SHALL report a value other than `true` or `false` for that line and leave the task's flag unchanged.

#### Scenario: Span written
- **WHEN** a task "Lisbon trip" is a span from 2026-11-03 to 2026-11-05
- **THEN** its line carries `📅 2026-11-05`, `🛫 2026-11-03` and `[span:: true]` in the vault's field order, and a file without the field round-trips unchanged for tasks that are not spans

#### Scenario: Span made in the file
- **WHEN** the user adds `[span:: true]` to a line with `🛫 2026-11-03` and `📅 2026-11-05` and syncs
- **THEN** the task is a span from 3 to 5 November on every device after their next sync

#### Scenario: Bad value
- **WHEN** a line carries `[span:: soon]`
- **THEN** the sync reports the file, line and reason, and the task's flag is unchanged
