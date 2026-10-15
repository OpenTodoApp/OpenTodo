# Spec Delta

## MODIFIED Requirements

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders, saved views, custom field definitions and attachments with their original ids and restore every task's `fields` values, store recurrence canonical and carry every other schema field. Files SHALL come from the ZIP export within the account's limits and be counted in a note for the JSON alone. Comments SHALL NOT be imported; the preview notes their count. Another account as assignee SHALL be dropped with a warning.

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

#### Scenario: ZIP export restores files
- **WHEN** a ZIP export holding 5 attachment files is imported into an empty account
- **THEN** the 5 attachments exist with their original ids, names and bytes, are uploaded (devices can open them after sync), and a file over the per-file limit or beyond the quota is reported on its row and skipped

#### Scenario: JSON export alone
- **WHEN** the JSON export of an account with 5 file attachments and 2 link attachments is imported
- **THEN** the 2 link attachments are recreated, the preview notes that 5 files need the ZIP export, and no file attachment is written
