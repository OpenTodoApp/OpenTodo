## MODIFIED Requirements

### Requirement: Field mapping
Imported rows SHALL map onto the existing entities: projects by case-insensitive name (reusing a non-deleted match), subtasks to `parent_id`, labels to `labels`, priority to 1–4 (default 4), due dates to floating `{date, time?}`, completion to `completed_at`, creation time to `created_at`, and recurrence, reminders and sections as specified below. Parts the data model cannot hold SHALL be dropped with a per-row warning, never silently.

#### Scenario: Date-time with zone becomes floating
- **WHEN** a row carries a due date-time with a time zone offset and the user selected a time zone in the preview
- **THEN** the task's due date and time are the wall-clock values of that instant in the selected time zone

#### Scenario: Subtask references its parent
- **WHEN** a row names a parent that is also part of the same file
- **THEN** the imported child task's `parent_id` is the id assigned to the imported parent, whatever the order of rows

#### Scenario: Unsupported attribute dropped with warning
- **WHEN** a row carries an attachment or a recurrence rule the rule grammar cannot express
- **THEN** the task is still imported and the row is marked with a warning naming the dropped attribute

### Requirement: Dry-run preview
`POST /api/v1/import/preview` SHALL return, without writing anything, the detected format, totals (including new sections, recurring tasks and reminders), file-level notes, and per-row results: `create`, `update`, `skip` with reason, or `error` with reason and row or source id. Options SHALL include target project, time zone, sections (`section`, `label`, `ignore`), duplicates (`skip`, `import`) and errors (`skip_rows`, `abort`).

#### Scenario: Preview reports per-row outcomes
- **WHEN** a CSV with 100 rows of which 3 have an invalid priority is previewed
- **THEN** the response lists 97 rows as `create`, 3 rows as `error` naming the row number and the invalid value, and totals matching those counts

#### Scenario: Preview counts sections, recurring tasks and reminders
- **WHEN** a file with 2 sections, 3 recurring tasks and 4 reminders on importable tasks is previewed
- **THEN** the totals report 2 new sections, 3 recurring tasks and 4 reminders, and nothing is written

#### Scenario: Preview requires authentication
- **WHEN** a preview request carries no session or bearer token
- **THEN** the response is a 401 `unauthorized` error and the file is not read

#### Scenario: Preview with an oversized file
- **WHEN** the uploaded file exceeds the configured size limit
- **THEN** the response is a 413 `too_large` error naming the limit and no row is processed

### Requirement: Undo an import
`POST /api/v1/import/jobs/{id}/undo` SHALL soft-delete every entity the job created (projects, tasks, labels, sections, reminders and views) by writing tombstone operations, SHALL leave entities the job only updated untouched, SHALL move the user's other open tasks out of undone projects and sections, and SHALL mark the job `undone`. Undo SHALL be idempotent.

#### Scenario: Undo removes created items everywhere
- **WHEN** a user undoes a finished job that created 200 tasks, 4 projects, 3 sections and 5 reminders
- **THEN** those entities carry `deleted_at`, disappear from every view, remain in the export, and other devices hide them after their next sync

#### Scenario: Undo of another user's job
- **WHEN** a user requests undo for a job id that belongs to a different account
- **THEN** the response is a 404 `not_found` error and nothing changes

## ADDED Requirements

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders and saved views with their original ids, so section placement, recurring series and reminder links need no remapping. Task recurrence SHALL be stored canonical and every other schema field carried. Comments SHALL NOT be imported; the preview SHALL note their count. An assignee other than the importing account SHALL be dropped with a warning. Writes are ops that sync to every device.

#### Scenario: Round trip keeps sections, series and reminders
- **WHEN** an export holding sections, a recurring task with occurrence records and future reminders is imported into an empty account
- **THEN** a fresh export of that account lists the same sections, tasks (with `section_id`, `recurrence`, `series_id`), reminders and views as the file

#### Scenario: Comments are reported, not imported
- **WHEN** an export with 12 comments is previewed
- **THEN** the preview carries a note that 12 comments are not imported and why, and no comment is written

#### Scenario: Offline device receives the restored data
- **WHEN** the import finishes while a device of the account is offline and the device later syncs
- **THEN** it receives the sections, reminders and recurring tasks as ordinary operations and converges under last-writer-wins

### Requirement: Imported reminders
Reminders SHALL be imported with their task only. Own-export delivery and dismissal state SHALL be kept. A live reminder whose firing time has passed with no delivery or dismissal for that firing SHALL be imported dismissed at import time, with a warning, so no stale notification is pushed. Other formats SHALL map absolute instants and minutes before the due time; location reminders SHALL be dropped with a warning.

#### Scenario: Past reminder imported dismissed
- **WHEN** an imported reminder's firing time lies before the import and it was neither delivered nor dismissed
- **THEN** it is created with `dismissed_at` set to the import time, the row carries a warning, and no notification is sent

#### Scenario: Relative reminder from another format
- **WHEN** a task due 2026-11-02 at 10:00 carries a reminder 30 minutes before and the user chose Europe/Rome
- **THEN** a relative reminder with `offset_minutes` -30 and `fire_at` 09:30 Rome time on that date is created for the imported task

#### Scenario: Re-import does not duplicate reminders
- **WHEN** the same foreign file is imported again
- **THEN** its tasks are skipped as `already_imported` and no further reminder is created

### Requirement: Recurrence from other formats
Recurrence strings in other formats SHALL become rules when the rule grammar can express them: the grammar itself, RRULEs, the common spellings and structured frequency objects listed in `docs/import.md`. A recurring task without a due date SHALL get the rule's first date from today. Anything else SHALL be a row warning in the preview and the task imported without a rule.

#### Scenario: Common spelling becomes a rule
- **WHEN** a row due on a Tuesday at 16:00 carries the recurrence `every tue 4pm`
- **THEN** the task is created with the rule `every tuesday`, keeps its due date and time, and is counted as recurring in the preview

#### Scenario: RRULE becomes a rule
- **WHEN** a row carries `RRULE:FREQ=WEEKLY;INTERVAL=2`
- **THEN** the task is created with the rule `every 2 weeks`

#### Scenario: Unsupported recurrence is reported
- **WHEN** a row carries the recurrence `every 3 hours`
- **THEN** the preview row shows a warning naming the unsupported recurrence and the task is imported without a rule

### Requirement: Sections from other formats
With `sections: section` (the default), a row's section SHALL be matched by name, ignoring case, among the live sections of the task's project, or created once in that project; sections listed by the file SHALL be created even when empty. A task without a project SHALL get its section as a label, with a warning. `label` and `ignore` SHALL keep their behaviour.

#### Scenario: Section created in the task's project
- **WHEN** two rows of project Work name section `Q4` and the account has no such section
- **THEN** one section `Q4` is created in Work and both tasks carry its id in `section_id`

#### Scenario: Existing section reused
- **WHEN** a row names section `backlog` for a project that already has a live section `Backlog`
- **THEN** no section is created and the task is placed in the existing one

#### Scenario: Inbox task with a section
- **WHEN** a row without a project names a section and no target project is chosen
- **THEN** the task is imported into the Inbox with the section name as a label and a warning
