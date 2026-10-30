# Spec Delta

## ADDED Requirements

### Requirement: Part of the day in task lines
A task line SHALL carry the inline field `[daypart:: morning]` or `[daypart:: afternoon]` when the task has that part (OpenSpec `day-parts`), written right after the place of `[evening:: true]` in the field order; an evening task SHALL keep `[evening:: true]` and never carry `[daypart:: …]`. Reading the field SHALL set the part with the evening flag cleared; a line with both SHALL read as Evening. Removing the field SHALL clear the part on the next sync, merged per field like every vault field. Another value SHALL be reported for that line and leave the task's part unchanged.

#### Scenario: Morning task written
- **WHEN** a task "Stretch" due 2026-10-25 is set to Morning
- **THEN** its line is `- [ ] Stretch 📅 2026-10-25 [daypart:: morning] 🆔 <id>`

#### Scenario: Unknown value
- **WHEN** the user writes `[daypart:: night]` on a line
- **THEN** the sync reports the line and the task's part is unchanged
