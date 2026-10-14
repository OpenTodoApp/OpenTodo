# Spec Delta

## MODIFIED Requirements

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders, saved views and custom field definitions with their original ids, and restore every task's `fields` values under those ids, so section placement, recurring series, reminder links and field values need no remapping. Task recurrence SHALL be stored canonical and every other schema field carried. Comments SHALL NOT be imported; the preview SHALL note their count. An assignee other than the importing account SHALL be dropped with a warning. Writes are ops that sync to every device.

#### Scenario: Round trip keeps sections, series and reminders
- **WHEN** an export holding sections, a recurring task with occurrence records and future reminders is imported into an empty account
- **THEN** a fresh export of that account lists the same sections, tasks (with `section_id`, `recurrence`, `series_id`), reminders and views as the file

#### Scenario: Round trip keeps fields
- **WHEN** an export holding two field definitions (one deleted) and tasks with values is imported into an empty account
- **THEN** a fresh export lists the same definitions with their ids and deletion state and the same `fields` values on the tasks, and the preview counts the definitions as "fields"

#### Scenario: Comments are reported, not imported
- **WHEN** an export with 12 comments is previewed
- **THEN** the preview carries a note that 12 comments are not imported and why, and no comment is written

#### Scenario: Offline device receives the restored data
- **WHEN** the import finishes while a device of the account is offline and the device later syncs
- **THEN** it receives the sections, reminders, recurring tasks and field definitions and values as ordinary operations and converges under last-writer-wins
