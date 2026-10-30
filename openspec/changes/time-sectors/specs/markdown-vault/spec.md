## ADDED Requirements

### Requirement: Time sector in task lines
A task line SHALL carry the sector (OpenSpec `time-sectors`) as the inline field `[sector:: <period>]`, written after `[evening:: true]` and read in any order, omitted when empty. Removing the field from a line SHALL clear the sector through the vault's merge rules. An invalid period SHALL be reported for that file and line and leave the task's sector unchanged. The vault guide's shared vectors SHALL include a line with a sector.

#### Scenario: Written to the file
- **WHEN** a task "Plan the offsite" in Work has the sector `2026-11` and the vault syncs
- **THEN** its line reads `- [ ] Plan the offsite [sector:: 2026-11] 🆔 <id>`

#### Scenario: Set in the file offline
- **WHEN** the user adds `[sector:: 2026-W46]` to a line while the server is unreachable, then syncs later
- **THEN** the task's sector is `2026-W46` on every device after the sync

#### Scenario: Invalid period
- **WHEN** a line carries `[sector:: 2026-Q7]`
- **THEN** the sync reports the file, line and reason, the task's sector is unchanged, and the rest of the file is synced
