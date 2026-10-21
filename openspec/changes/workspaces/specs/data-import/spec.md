## MODIFIED Requirements

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders, saved views and attachments with their original ids, store recurrence canonical and carry every other schema field, and SHALL place every project, label, view and task in a workspace: an exported workspace the importing account owns (matched by id, then by name ignoring case) keeps its items; any other exported workspace is created for the importing account when it was the exporter's own and the account has room under its workspace limit, and otherwise its items go to the importing account's default workspace with a note naming the workspace. Members and groups are never imported; the preview notes their count. File attachments SHALL come with their bytes from the ZIP export, within the account's limits, and be counted in a note for the JSON export alone. Comments SHALL NOT be imported; the preview notes their count. Another account as assignee SHALL be dropped with a warning. Writes are ops.

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

#### Scenario: Workspaces restored
- **WHEN** an export with the workspaces "Personal" (default) and "Work" (owned by the exporter, with two members) is imported into a fresh account
- **THEN** the default workspace's items go to the importing account's default workspace, a "Work" workspace is created with the account as its only member, Work's projects, labels and views carry its new id, and the preview notes that 2 members are not imported

#### Scenario: Workspace the account cannot create
- **WHEN** the export holds a workspace the exporter was only a member of, or the importing account already owns 20 workspaces
- **THEN** that workspace's items are imported into the default workspace and the preview notes the workspace by name
