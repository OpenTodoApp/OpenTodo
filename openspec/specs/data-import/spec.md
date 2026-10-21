# data-import Specification

## Purpose
Defines how data enters OpenTodo from files: the accepted formats and their field mapping, the dry-run preview, duplicate detection, the import job with its limits and per-row error reporting, write-through to the operation log so imports sync everywhere, and undo of a whole import.

## Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, JSON exports of other task managers through named importer profiles, and the export files of named apps (`todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-db`), all documented in `docs/import.md`. The format SHALL be detected from the file content and the detected format SHALL be shown and overridable before anything is written.

#### Scenario: Own export is detected
- **WHEN** a file whose top-level document carries `"format":"opentodo-export"` is uploaded for preview
- **THEN** the preview reports the format `opentodo` and the export version, and no profile choice is required

#### Scenario: CSV with documented columns
- **WHEN** a CSV file whose header row contains at least a `title` column is uploaded
- **THEN** the preview reports the format `csv`, lists recognised and ignored columns, and maps `project`, `section`, `parent`, `priority`, `due_date`, `due_time`, `labels`, `description`, `completed_at` and `created_at` when present

#### Scenario: Unrecognised file
- **WHEN** a file matches neither the own export, CSV, nor any importer profile or named app format
- **THEN** the preview is refused with a 400 `unsupported_format` error naming the formats that are supported

#### Scenario: A named app's export is detected
- **WHEN** a Todoist project CSV export is uploaded for preview without choosing a format
- **THEN** the preview reports the format `todoist-csv`, and a TickTick backup, a Linear CSV and a Things database are likewise reported as `ticktick-csv`, `linear-csv` and `things-db`

### Requirement: Field mapping
Imported rows SHALL map onto the existing entities: projects by case-insensitive name (reusing a live match), subtasks to `parent_id`, labels to `labels`, priority to 1–4 (default 4), due dates to floating `{date, time?}`, completion to `completed_at`, creation to `created_at`, `http(s)` attachment references to link attachments, and recurrence, reminders and sections as below. Parts the model cannot hold SHALL be dropped with a per-row warning, never silently.

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

### Requirement: Duplicate detection
The importer SHALL detect duplicates in three ways: an own-export row whose id already exists is an `update` (when the user chose to overwrite) or a `skip`; a row whose source id was recorded by an earlier import of the same profile for this user is a `skip`; and a row whose normalised title, project and due date match an existing open task is flagged `possible_duplicate` and skipped unless the user chose to import duplicates.

#### Scenario: Re-importing the same foreign file
- **WHEN** a user imports a foreign export, then previews the same file again
- **THEN** every row previously imported is reported as `skip` with reason `already_imported` and nothing is created on commit

#### Scenario: Round trip preserves ids
- **WHEN** an own export is imported into an empty account
- **THEN** every project and task is recreated with its original id, fields, completion state and tombstones, and a fresh export of the account is equivalent to the imported file

### Requirement: Import job writes through the operation log
`POST /api/v1/import` SHALL start a job and return 202 with its id; `GET /api/v1/import/jobs` and `GET /api/v1/import/jobs/{id}` SHALL report status (`running`, `done`, `failed`), counts and per-row errors. Every created or changed field SHALL be written as operations stamped with server time and the device id `import`, so devices receive imported data on their next sync under the usual last-writer-wins rules. Source `created_at` and `completed_at` are field values, not operation timestamps.

#### Scenario: Imported data reaches every device
- **WHEN** an import job finishes and a device that was offline during the import comes back and syncs
- **THEN** the device receives the imported projects and tasks as ordinary operations and shows them

#### Scenario: Concurrent edit converges
- **WHEN** an own-export import overwrites a task's title while another device changed the same title offline after the import ran
- **THEN** after sync every device shows the device's later title, because its timestamp is greater

#### Scenario: Job start rejected for invalid options
- **WHEN** the request names a target project that does not belong to the user or an unknown time zone
- **THEN** the response is a 400 `invalid_input` error and no job is created

#### Scenario: Job routes require authentication
- **WHEN** any `/api/v1/import/*` route is requested without credentials
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Limits and per-row errors
The server SHALL refuse files larger than the configured limit (default 20 MB, optional `OPENTODO_IMPORT_MAX_MB`) and files with more than 50,000 rows, SHALL process at most one import job per user at a time, and SHALL never abort a whole job because of one bad row unless the user chose `abort`. Errors SHALL be reported per row with the row number or source id and a reason.

#### Scenario: Skip bad rows by default
- **WHEN** a job runs with `skip_rows` and 5 of 1,000 rows are invalid
- **THEN** 995 tasks are created, the job ends `done` with 5 errors listed, and no partial task exists for the bad rows

#### Scenario: Abort on error
- **WHEN** a job runs with `abort` and a row is invalid
- **THEN** no operation is written, the job ends `failed` naming the first bad row, and the account is unchanged

#### Scenario: Second job while one runs
- **WHEN** a user starts an import while another of theirs is still running
- **THEN** the response is a 409 `conflict` error naming the running job

### Requirement: Undo an import
`POST /api/v1/import/jobs/{id}/undo` SHALL soft-delete every entity the job created (projects, tasks, labels, sections, reminders, views and attachments) by writing tombstone operations, SHALL leave entities the job only updated untouched, SHALL move the user's other open tasks out of undone projects and sections, and SHALL mark the job `undone`. Undo SHALL be idempotent.

#### Scenario: Undo removes created items everywhere
- **WHEN** a user undoes a finished job that created 200 tasks, 4 projects, 3 sections, 5 reminders and 6 attachments
- **THEN** those entities carry `deleted_at`, disappear from every view, remain in the export, other devices hide them after their next sync, and the attachments' files follow the removal retention

#### Scenario: Undo of another user's job
- **WHEN** a user requests undo for a job id that belongs to a different account
- **THEN** the response is a 404 `not_found` error and nothing changes

### Requirement: Import screen
Settings SHALL offer an Import section with a file picker, the detected format and options, the preview table with per-row outcomes, a commit action, and a list of past jobs with their summary and an undo action. Every step SHALL be reachable with the keyboard. Because import runs on the server, the screen SHALL state that a connection is required and SHALL disable the picker while offline; past job summaries SHALL remain readable from the last fetched state.

#### Scenario: Import from settings
- **WHEN** the user picks a CSV file, reviews the preview and confirms
- **THEN** the job starts, its progress is shown until done, and the imported tasks appear in their views without a page reload

#### Scenario: Offline
- **WHEN** the user opens the Import section without a network connection
- **THEN** the screen explains that import needs a connection, the file picker is disabled, and the previously loaded job list is still visible

### Requirement: Own export completeness
Importing an own export SHALL also recreate its sections, reminders, saved views and attachments with their original ids, store recurrence canonical and carry every other schema field. File attachments SHALL come with their bytes from the ZIP export, within the account's limits, and be counted in a note for the JSON export alone. Comments SHALL NOT be imported; the preview notes their count. Another account as assignee SHALL be dropped with a warning. Writes are ops.

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

### Requirement: Own export restores custom fields
Importing an own export SHALL recreate its custom field definitions with their original ids and deletion state and restore every task's `fields` values, values of deleted or foreign definitions included (OpenSpec `custom-fields`). The preview SHALL count the live definitions it creates as "fields". Devices SHALL receive the definitions and values as ordinary operations.

#### Scenario: Round trip keeps fields
- **WHEN** an export holding two field definitions (one deleted) and tasks with values is imported into an empty account
- **THEN** a fresh export lists the same definitions with their ids and deletion state and the same `fields` values on the tasks, and the preview counts the definitions as "fields"

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

### Requirement: Imported deadlines
A deadline in an imported file SHALL become the task's `deadline`, written as an operation like every imported field: the Todoist `DEADLINE` column, the Things to-do `deadline`, the generic JSON `deadline` key and a CSV `deadline` column (`YYYY-MM-DD`). A deadline with a time of day SHALL keep the date and drop the time with a row warning. The own export SHALL round-trip the field, and the preview SHALL count rows with a deadline.

#### Scenario: Todoist deadline
- **WHEN** a Todoist backup task has `DEADLINE` `21 Okt.` with deadline language `de`, exported in 2026
- **THEN** the task is imported with the deadline `2026-10-21` and no warning about it

#### Scenario: Things deadline
- **WHEN** a Things to-do has a start date of 2026-11-02 and a deadline of 2026-11-30
- **THEN** the task is due 2026-11-02 with the deadline `2026-11-30`, its description carries no "Deadline:" line and the row has no deadline warning

#### Scenario: Generic JSON with both keys
- **WHEN** a generic JSON item carries `"due": "2026-11-02"` and `"deadline": "2026-11-06T17:00:00Z"`
- **THEN** the task is due 2026-11-02 with the deadline `2026-11-06` and a warning that the deadline's time was dropped

#### Scenario: CSV column
- **WHEN** a CSV row has `deadline` `2026-11-06` and an empty `due_date`
- **THEN** the task has no due date and the deadline `2026-11-06`, and `deadline` is listed among the recognised columns

#### Scenario: Invalid deadline in a row
- **WHEN** a CSV row has `deadline` `next friday`
- **THEN** the row is reported as an error naming the value, and with `skip_rows` the other rows are still imported

#### Scenario: Own export round trip
- **WHEN** an export holding tasks with deadlines is imported into an empty account while a device of that account is offline
- **THEN** a fresh export lists the same deadlines, and the device receives them as ordinary operations on its next sync

### Requirement: Imported start dates, Someday and evening
An imported Someday state SHALL become `start` `someday`, a start date the `start` date, and an evening mark `evening`, written as operations like every imported field: Things `start` 2 (Someday) and `startBucket` 1 (This Evening), and the CSV columns `start` (`YYYY-MM-DD` or `someday`) and `evening` (`true`/`false`). A row that is both parked and dated SHALL keep the date and drop Someday with a warning. The own export SHALL round-trip both fields.

#### Scenario: Things Someday to-do
- **WHEN** a Things to-do has `start` 2 and no start date
- **THEN** the task is imported parked, with no due date and no warning about Someday

#### Scenario: Things evening to-do
- **WHEN** a Things to-do has `startBucket` 1 and a start date of 2026-10-21
- **THEN** the task is due 2026-10-21 with the evening flag set and no warning about This Evening

#### Scenario: CSV columns
- **WHEN** a CSV row has `start` `someday` and another has `start` `2026-11-03` with `evening` `true`
- **THEN** the first task is parked, the second has the start `2026-11-03` and the evening flag, and both columns are listed as recognised

#### Scenario: Parked and dated row
- **WHEN** a CSV row has `start` `someday` and `due_date` `2026-11-03`
- **THEN** the task is imported due 2026-11-03 and not parked, with a warning that Someday was dropped

#### Scenario: Own export round trip
- **WHEN** an export holding parked, deferred and evening tasks is imported into an empty account while a device of that account is offline
- **THEN** a fresh export lists the same `start` and `evening` values, and the device receives them as ordinary operations on its next sync

### Requirement: Dependencies from imported files
An own export SHALL round-trip `blocked_by` with the original ids. A format that carries blocking relations between rows of the same file SHALL map them onto `blocked_by` of the imported tasks, written after every task of the job exists so no reference is refused; a relation to a row outside the file, or one that would close a cycle, SHALL be dropped with a per-row warning. Undo of the job SHALL leave no dangling blocker visible.

#### Scenario: Own export round trip
- **WHEN** an export in which "Book flights" is blocked by "Confirm dates" is imported into an empty account
- **THEN** the imported "Book flights" is blocked by the imported "Confirm dates", and a fresh export lists the same `blocked_by`

#### Scenario: Relation to a row outside the file
- **WHEN** a row names a blocking relation to an identifier that is not in the file
- **THEN** the task is imported without that blocker and the preview row carries a warning naming the relation

#### Scenario: Offline device converges
- **WHEN** the import finishes while a device is offline and it later syncs
- **THEN** it receives the `blocked_by` operations like any other and shows the same blocked tasks

### Requirement: Template files in the importer
An own-export file that carries a top-level `template` object SHALL import like any own export: ids kept, existing ids skipped as `exists`, dates as written, the optional `template` key ignored for the data. The preview SHALL report that the file is a template and that "From a template" in the sidebar creates a fresh copy with shifted dates, so a user who wants a reusable copy is not sent through the importer twice.

#### Scenario: Template previewed in the importer
- **WHEN** a file with `format: "opentodo-export"` and `template.day` is uploaded for preview
- **THEN** the preview reports the format `opentodo`, lists its rows as `create`, and carries a note that the file is a template and where to start it as a new project

#### Scenario: Imported twice
- **WHEN** the same template file is imported a second time through the Import screen
- **THEN** every row is skipped with reason `exists` and nothing is created

#### Scenario: Unauthenticated preview
- **WHEN** a request without credentials posts a template file to the preview route
- **THEN** the response is 401 `unauthorized` and nothing is read

### Requirement: Project descriptions from other formats
When a JSON import format carries projects with a description (`description`, `notes` or `note` on a project object), the importer SHALL set the created project's `description` to that text. A project matched by name and reused SHALL keep its existing description. The description SHALL be written as an ordinary operation of the import job, so devices receive it on their next sync and a device that later opens the project folds it into the project's note document.

#### Scenario: New project with a description
- **WHEN** a `json-generic` file lists a project `{"name": "Trip", "description": "Flights booked, hotel pending"}` and the account has no project named Trip
- **THEN** the preview shows the project row as `create` and the imported project's description is "Flights booked, hotel pending"

#### Scenario: Existing project keeps its note
- **WHEN** the same file is imported into an account that already has a live project named "trip" with its own note
- **THEN** the project is reused, its note is unchanged, and no description operation is written for it

#### Scenario: Undo removes the description with the project
- **WHEN** the import that created "Trip" is undone
- **THEN** the project and its description are removed as one import, leaving nothing behind

### Requirement: ZIP archives of exports
The server SHALL accept a ZIP archive whose entries are files of one supported format and import them as one job, one preview and one undo. It SHALL refuse an archive with more than 1,000 entries, an uncompressed total above ten times the upload limit, or entries of mixed formats, with a 400 error naming the reason, before writing anything. Entries that are not data files (folders, hidden system files) SHALL be ignored.

#### Scenario: Todoist backup
- **WHEN** the user uploads a Todoist backup ZIP containing one CSV per project
- **THEN** the preview reports `todoist-backup`, lists every project with its tasks, and committing creates them in one job that a single undo removes

#### Scenario: Oversized archive
- **WHEN** an uploaded ZIP would expand beyond ten times the upload limit
- **THEN** the preview is refused with a 400 error stating the archive is too large when unpacked, and nothing is written

#### Scenario: Unauthenticated upload
- **WHEN** a ZIP is posted to the preview route without a session or token
- **THEN** the server answers 401 and does not read the archive

### Requirement: Todoist structure
A Todoist export SHALL map each project file to a project, section rows to sections, and task rows to tasks nested by their indent level into subtasks. Note rows SHALL be appended to their task's description under a "Comments" heading, because their authors cannot be kept.

#### Scenario: Nested tasks and sections
- **WHEN** a Todoist CSV contains a section row followed by a task at indent 1 and a task at indent 2
- **THEN** the first task is in that section and the second is its subtask

#### Scenario: Board projects stay boards
- **WHEN** a Todoist project file's meta row says `view_style=board` and the import is committed from the web app
- **THEN** that project opens as a board on the importing device, and other devices keep their own choice

### Requirement: Todoist attributes
A Todoist task SHALL keep the priority level the user saw in Todoist (Todoist's highest becomes p1), its labels written in the content and its description. Responsible people other than the importing user SHALL be dropped with a warning.

#### Scenario: Priority as the user saw it
- **WHEN** a task was shown as priority 1 (red) in Todoist
- **THEN** it is imported with priority p1

### Requirement: Todoist dates
A Todoist date string SHALL become the task's due date. Date strings are written in the language named by the row (for example `21 Okt.` in German) and may omit the year, which SHALL be taken from the export date. Recurring strings SHALL become recurrence rules where the rule grammar can express them. A string that cannot be read SHALL leave the task without a due date and add a warning quoting it.

#### Scenario: Localised date without a year
- **WHEN** a backup exported on 2026-09-19 has a task dated `21 Okt.` with date language `de`
- **THEN** the task is due on 2026-10-21

#### Scenario: Recurring date string
- **WHEN** a task's date is `every monday`
- **THEN** it is imported as a recurring task with the rule `every monday` and its next Monday as due date

### Requirement: TickTick structure
A TickTick CSV backup SHALL be recognised despite the preamble before its header, whose quoted values may span several lines. Lists SHALL become projects with folders as parent projects, the board column name SHALL become the section, and checklist items SHALL become subtasks.

#### Scenario: Checklist becomes subtasks
- **WHEN** a TickTick task is a checklist with three items, one checked
- **THEN** it is imported with three subtasks, one of them completed

#### Scenario: Folder and list
- **WHEN** a list "Groceries" sits in the folder "Home"
- **THEN** the project "Groceries" is created as a sub-project of "Home"

### Requirement: TickTick attributes
A TickTick task SHALL keep its tags as labels, its content as the description, its priority (high, medium, low, none) as p1, p2, p3, p4, its due date and time as a floating due date using the export's time zone, its repeat rule as recurrence where expressible, and its completed status and time. Abandoned tasks SHALL be imported completed with the label `canceled`.

#### Scenario: High priority with a repeat rule
- **WHEN** a TickTick task has high priority and the repeat rule `FREQ=WEEKLY;BYDAY=MO`
- **THEN** it is imported with priority p1 and the rule `every monday`

### Requirement: Linear structure
A Linear CSV export SHALL put each issue in its Linear project, or in a project named after its team when it has none. The workflow status SHALL become a section of that project, so the board shows the same columns, and the parent issue SHALL become the parent task.

#### Scenario: Statuses become board columns
- **WHEN** a Linear project has issues in `Todo`, `In Progress` and `In Review`
- **THEN** the imported project has those three sections, each holding its issues, and switching the project to the board shows them as columns

### Requirement: Linear attributes
A Linear issue SHALL be completed when it was completed or canceled, with canceled ones labelled `canceled`. Its priority (urgent, high, medium, low, none) SHALL map to p1, p2, p3, p4, p4. Labels, the due date and the Markdown description SHALL be kept, the description starting with the issue identifier, and the identifier SHALL also become the task's origin `{kind: "issue", provider: "linear", id: <identifier>}` without a URL, since the export carries none. An issue assigned to the importing user's email address SHALL stay assigned to them. Estimates, cycles, milestones, relations and other assignees SHALL be dropped with a warning.

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

#### Scenario: Identifier kept
- **WHEN** issue `ENG-123` is imported
- **THEN** its description starts with `ENG-123` and its origin is `{kind: "issue", provider: "linear", id: "ENG-123"}`, shown as a chip reading "ENG-123" without a link

### Requirement: Things database
The server SHALL accept the `main.sqlite` file of a Things 3 database, alone or inside a ZIP of the `Things Database.thingsdatabase` folder, and `docs/import.md` SHALL explain how to copy it with Things closed. The file SHALL be opened read-only, only Things' known tables SHALL be read, it SHALL be deleted after the preview or import, and a file that is not a Things database of a supported schema version SHALL be refused with a 400 error naming the reason.

#### Scenario: Copy of the database
- **WHEN** the user uploads `main.sqlite` copied from Things with the app closed
- **THEN** the preview reports `things-db` and lists the areas, projects, headings and to-dos

#### Scenario: Some other SQLite file
- **WHEN** the user uploads a SQLite file without Things' tables
- **THEN** the preview is refused with a 400 error stating it is not a Things database, and nothing is written

### Requirement: Things structure
A Things database SHALL map areas to parent projects, projects to projects, headings to sections, to-dos to tasks, checklist items to subtasks, tags to labels and notes to the description. Trashed items SHALL be skipped.

#### Scenario: Area with a project and headings
- **WHEN** a Things area "Work" holds a project "Launch" with headings "Prepare" and "Ship"
- **THEN** the project "Launch" is a sub-project of "Work" with sections "Prepare" and "Ship"

### Requirement: Things dates
A Things to-do's start ("when") date SHALL become its due date, repeating to-dos SHALL become recurring tasks where expressible, and completed or canceled items SHALL be completed tasks. A deadline SHALL become the task's deadline (OpenSpec change `deadlines`). Someday SHALL park the task and This Evening SHALL set its evening flag (OpenSpec change `someday-and-evening`).

#### Scenario: Deadline imported
- **WHEN** a to-do has a deadline of 2026-11-30
- **THEN** the task's deadline is 2026-11-30, its description has no "Deadline:" line and the row has no deadline warning

### Requirement: Named formats are verified against real exports
Each named app format SHALL be tested against at least one export file produced by that app from a real account, stripped of personal data and kept with the tests. A change to a format's detection or mapping SHALL keep every such file importing with the same rows, warnings and errors unless the change states the difference.

#### Scenario: Regression on a real file
- **WHEN** a contributor changes the Todoist mapping so that a fixture's subtask becomes a top-level task
- **THEN** the importer tests fail and name the fixture and the row

### Requirement: Imported origins
A task imported from a Todoist, Things or TickTick export SHALL carry the origin `{kind: "import", provider: <profile name>, id: <source id>}`, the same source id the importer records for duplicate detection, without a URL. A task from a generic CSV or JSON file SHALL carry none. An own export SHALL carry each task's `origin` and the import of an own export SHALL restore it unchanged, so the round trip is equivalent. Origins are written in the import's operations, like every other field.

#### Scenario: TickTick task keeps its id
- **WHEN** a TickTick row with `taskId` `6f1a…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "ticktick", id: "6f1a…"}` and `origin: ticktick` lists it

#### Scenario: Things item keeps its uuid
- **WHEN** a Things to-do with uuid `A1B2…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "things", id: "A1B2…"}`

#### Scenario: Round trip keeps origins
- **WHEN** an export holding a task captured from a page, a task from email and an imported issue is imported into an empty account
- **THEN** a fresh export lists the three tasks with the same `origin` values as the file

#### Scenario: Generic file has none
- **WHEN** a generic CSV with a `title` column is imported
- **THEN** the created tasks have no origin, and the preview shows no origin column

#### Scenario: Offline device receives origins
- **WHEN** the import finishes while a device is offline and the device later syncs
- **THEN** the imported tasks arrive with their origins as ordinary operations and the chips show on that device
