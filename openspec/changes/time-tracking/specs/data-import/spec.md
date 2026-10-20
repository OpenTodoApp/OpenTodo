# Spec Delta

## MODIFIED Requirements

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders, saved views, attachments and time entries with their original ids, store recurrence canonical and carry every other schema field. Time entries whose `user_id` is not the importing account SHALL be dropped with a warning that counts them, like another account as assignee; a running entry SHALL be imported as it is. File attachments SHALL come with their bytes from the ZIP export, within the account's limits, and be counted in a note for the JSON export alone. Comments SHALL NOT be imported; the preview notes their count. Writes are ops.

#### Scenario: Round trip keeps sections, series and reminders
- **WHEN** an export holding sections, a recurring task with occurrence records and future reminders is imported into an empty account
- **THEN** a fresh export of that account lists the same sections, tasks (with `section_id`, `recurrence`, `series_id`), reminders and views as the file

#### Scenario: Comments are reported, not imported
- **WHEN** an export with 12 comments is previewed
- **THEN** the preview carries a note that 12 comments are not imported and why, and no comment is written

#### Scenario: Offline device receives the restored data
- **WHEN** the import finishes while a device of the account is offline and the device later syncs
- **THEN** it receives the sections, reminders and recurring tasks as ordinary operations and converges under last-writer-wins

#### Scenario: ZIP export restores files
- **WHEN** a ZIP export holding 5 attachment files is imported into an empty account
- **THEN** the 5 attachments exist with their original ids, names and bytes, are uploaded (devices can open them after sync), and a file over the per-file limit or beyond the quota is reported on its row and skipped

#### Scenario: JSON export alone
- **WHEN** the JSON export of an account with 5 file attachments and 2 link attachments is imported
- **THEN** the 2 link attachments are recreated, the preview notes that 5 files need the ZIP export, and no file attachment is written

#### Scenario: Round trip keeps time entries
- **WHEN** an export holding 40 time entries of the exporting account (one deleted) and 3 entries another member wrote on a shared task is imported into an empty account
- **THEN** a fresh export lists the 40 entries with their ids, times, notes and deletion state under the importing account's `user_id`, the preview counts them as "time entries" and warns that 3 entries of another account were dropped, and the row chips read the same tracked totals once a device syncs
