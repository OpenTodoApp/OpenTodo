## ADDED Requirements

### Requirement: Energy in task lines
A task line SHALL carry the inline field `[energy:: deep|medium|low]` when the task has an energy, written after `[evening:: true]` and read in any order. Removing the field from a line SHALL clear the energy on the next sync, merged per field like the other inline fields. Any other value SHALL be reported for that line and leave the energy unchanged. The field SHALL be pinned in `docs/vault.md` and the vault's fixture.

#### Scenario: Written
- **WHEN** "Clean the windows" has energy Low and the evening flag
- **THEN** its line ends with `[evening:: true] [energy:: low] 🆔 <id>`

#### Scenario: Read from a file
- **WHEN** the user adds `[energy:: Deep]` to a line and syncs
- **THEN** the task's energy is Deep and the line is rewritten as `[energy:: deep]`

#### Scenario: Invalid value
- **WHEN** a line reads `[energy:: high]`
- **THEN** the sync reports that line and the task's energy is unchanged
