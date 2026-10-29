## ADDED Requirements

### Requirement: Time sectors in Look ahead
While time sectors are on (OpenSpec `time-sectors`), the Look ahead step SHALL also list two groups of open tasks below the next seven days: those whose sector is carried over, and those of Next week. Each row SHALL offer, as visible buttons and in the row's action menu, Keep this week, Next week, This month and Date…. The existing list keys SHALL keep their meaning, so `n` parks the task in Someday. No new shortcut SHALL be registered. Each action SHALL be one undoable batch written through the operation log, applied locally first and converging like any sector edit. The section SHALL not change whether the step is done. With the switch off, or with no such task, the section SHALL not be shown.

#### Scenario: Carried-over tasks in the review
- **WHEN** it is Sunday of week 45 with Monday weeks and two open tasks still have the sector `2026-W44`
- **THEN** Look ahead lists them under "Carried over", and choosing Next week on one sets it to `2026-W46` and removes it from the section

#### Scenario: Park from the review
- **WHEN** a carried-over row is selected and the user presses `n`
- **THEN** the task is parked in Someday with its sector cleared in the same batch, and it leaves the section

#### Scenario: Offline review
- **WHEN** the device is offline and the user chooses Keep this week on a carried-over task
- **THEN** the task moves to This week at once and the batch uploads on the next sync

#### Scenario: Switch off
- **WHEN** time sectors are off and tasks with sectors exist
- **THEN** Look ahead shows the next seven days only
