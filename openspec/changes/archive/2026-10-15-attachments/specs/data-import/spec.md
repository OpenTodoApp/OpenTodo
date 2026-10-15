# Spec Delta

## MODIFIED Requirements

### Requirement: Field mapping
Imported rows SHALL map onto the existing entities: projects by case-insensitive name (reusing a non-deleted match), subtasks to `parent_id`, labels to `labels`, priority to 1–4 (default 4), due dates to floating `{date, time?}`, completion to `completed_at`, creation time to `created_at`, attachment references that are `http` or `https` URLs to link attachments of the task, and recurrence, reminders and sections as specified below. Parts the data model cannot hold SHALL be dropped with a per-row warning, never silently.

#### Scenario: Date-time with zone becomes floating
- **WHEN** a row carries a due date-time with a time zone offset and the user selected a time zone in the preview
- **THEN** the task's due date and time are the wall-clock values of that instant in the selected time zone

#### Scenario: Subtask references its parent
- **WHEN** a row names a parent that is also part of the same file
- **THEN** the imported child task's `parent_id` is the id assigned to the imported parent, whatever the order of rows

#### Scenario: Unsupported attribute dropped with warning
- **WHEN** a row carries an attachment that is not a URL, or a recurrence rule the rule grammar cannot express
- **THEN** the task is still imported and the row is marked with a warning naming the dropped attribute

#### Scenario: Attachment URL kept as a link
- **WHEN** a row carries an attachment given as `https://files.example.com/receipt.pdf` (a bare URL, or an object with a URL and a name)
- **THEN** the task is imported with a link attachment named `receipt.pdf` pointing there, the preview counts it, and the server fetches nothing

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders and saved views with their original ids, so section placement, recurring series and reminder links need no remapping. Task recurrence SHALL be stored canonical and every other schema field carried. Attachments SHALL be recreated with their original ids: link attachments always, file attachments with their bytes when the upload is the ZIP export (counting toward the importing account's quota and per-file limit) and as a note of their count when it is the JSON export alone. Comments SHALL NOT be imported; the preview SHALL note their count. An assignee other than the importing account SHALL be dropped with a warning. Writes are ops that sync to every device.

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

### Requirement: Undo an import
`POST /api/v1/import/jobs/{id}/undo` SHALL soft-delete every entity the job created (projects, tasks, labels, sections, reminders, views and attachments) by writing tombstone operations, SHALL leave entities the job only updated untouched, SHALL move the user's other open tasks out of undone projects and sections, and SHALL mark the job `undone`. Undo SHALL be idempotent.

#### Scenario: Undo removes created items everywhere
- **WHEN** a user undoes a finished job that created 200 tasks, 4 projects, 3 sections, 5 reminders and 6 attachments
- **THEN** those entities carry `deleted_at`, disappear from every view, remain in the export, other devices hide them after their next sync, and the attachments' files follow the removal retention

#### Scenario: Undo of another user's job
- **WHEN** a user requests undo for a job id that belongs to a different account
- **THEN** the response is a 404 `not_found` error and nothing changes
