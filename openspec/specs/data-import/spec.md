# data-import Specification

## Purpose
Defines how data enters OpenTodo from files: the accepted formats and their field mapping, the dry-run preview, duplicate detection, the import job with its limits and per-row error reporting, write-through to the operation log so imports sync everywhere, and undo of a whole import.

## Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, JSON exports of other task managers through named importer profiles, and the export files of named apps (`todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-db`, `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json`, `anydo-json`), all documented in `docs/import.md`. The format SHALL be detected from the file content and the detected format SHALL be shown and overridable before anything is written. A named format SHALL be detected only on a signature distinctive of that app's file, never on a product name alone, so that no file of one format is read as another and the generic JSON and CSV profiles keep every file they accepted before.

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
- **THEN** the preview reports the format `todoist-csv`, and the user can still choose another format before importing

#### Scenario: Six more apps are detected
- **WHEN** a Google Takeout `Tasks.json`, a Trello board JSON, an Asana project CSV, a Microsoft To Do Graph JSON, an Apple Reminders Shortcut JSON or an Any.do data-request JSON is uploaded for preview without choosing a format
- **THEN** the preview reports `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json` or `anydo-json` respectively, and the format menu of the import screen lists each of them with the app's name

#### Scenario: Existing fixtures keep their format
- **WHEN** every fixture kept with the tests, including the generic JSON and CSV ones, is detected after the six formats are added
- **THEN** each is reported in the format it was reported in before, and the detection test names any fixture whose format changed

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
Importing an own export SHALL also recreate its sections, reminders, saved views, attachments and time entries with their original ids, store recurrence canonical and carry every other schema field, and SHALL place every project, label, view and task in a workspace: an exported workspace the importing account owns (matched by id, then by name ignoring case) keeps its items; any other exported workspace is created for the importing account when it was the exporter's own and the account has room under its workspace limit, and otherwise its items go to the importing account's default workspace with a note naming the workspace. Members and groups are never imported; the preview notes their count. Time entries whose `user_id` is not the importing account SHALL be dropped with a warning that counts them, like another account as assignee; a running entry SHALL be imported as it is. File attachments SHALL come with their bytes from the ZIP export, within the account's limits, and be counted in a note for the JSON export alone. Comments SHALL NOT be imported; the preview notes their count. Another account as assignee SHALL be dropped with a warning. Writes are ops.

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

#### Scenario: Workspaces restored
- **WHEN** an export with the workspaces "Personal" (default) and "Work" (owned by the exporter, with two members) is imported into a fresh account
- **THEN** the default workspace's items go to the importing account's default workspace, a "Work" workspace is created with the account as its only member, Work's projects, labels and views carry its new id, and the preview notes that 2 members are not imported

#### Scenario: Workspace the account cannot create
- **WHEN** the export holds a workspace the exporter was only a member of, or the importing account already owns 20 workspaces
- **THEN** that workspace's items are imported into the default workspace and the preview notes the workspace by name

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
A Linear issue SHALL be completed when it was completed or canceled, with canceled ones labelled `canceled`. Its priority (urgent, high, medium, low, none) SHALL map to p1, p2, p3, p4, p4. Labels, the due date and the Markdown description SHALL be kept, the description starting with the issue identifier, and the identifier SHALL also become the task's origin `{kind: "issue", provider: "linear", id: <identifier>}` without a URL, since the export carries none. An issue assigned to the importing user's email address SHALL stay assigned to them. An estimate SHALL become the value of a number field named "Estimate" on the issue's project, created by the import when the project has no number field of that name (see "Imported custom fields"). Cycles, milestones, relations other than "Blocked by", and other assignees SHALL be dropped with a warning.

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

#### Scenario: Identifier kept
- **WHEN** issue `ENG-123` is imported
- **THEN** its description starts with `ENG-123` and its origin is `{kind: "issue", provider: "linear", id: "ENG-123"}`, shown as a chip reading "ENG-123" without a link

#### Scenario: Estimate becomes a field value
- **WHEN** a Linear CSV has issues with `Estimate` 3 and 5 in project "Launch", which has no field named "Estimate"
- **THEN** the preview counts one field definition to create, the import creates a number field "Estimate" on "Launch" and the two tasks carry the values 3 and 5, with no estimate warning

#### Scenario: Estimate field already exists
- **WHEN** the project the issues go to already has a number field named "Estimate"
- **THEN** no definition is created and the values are written to the existing field

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
Each named app format SHALL be tested against at least one export file produced by that app from a real account, stripped of personal data and kept with the tests. For an app that has no export of its own (Microsoft To Do, Apple Reminders, Any.do), the file SHALL be one produced from a real account by the exact script, Shortcut or data request the switch guide describes, and `docs/import.md` SHALL say so next to the format. A change to a format's detection or mapping SHALL keep every such file importing with the same rows, warnings and errors unless the change states the difference.

#### Scenario: Regression on a real file
- **WHEN** a contributor changes the Todoist mapping so that a fixture's subtask becomes a top-level task
- **THEN** the importer tests fail and name the fixture and the row

#### Scenario: Scripted export is pinned like a built-in one
- **WHEN** a contributor changes how `microsoft-todo-json` reads `dueDateTime`
- **THEN** the golden preview of the sanitised file produced by the guide's script fails until the golden is updated with the stated difference

### Requirement: Imported origins
A task imported from a Todoist, Things, TickTick, Google Tasks, Trello, Asana, Microsoft To Do, Apple Reminders or Any.do export SHALL carry the origin `{kind: "import", provider: <profile name>, id: <source id>}`, the same source id the importer records for duplicate detection, without a URL, the provider being the profile's short name (`todoist`, `things`, `ticktick`, `google-tasks`, `trello`, `asana`, `microsoft-todo`, `apple-reminders`, `anydo`). A Trello card SHALL carry its `shortUrl` as the origin's URL, since the export provides one. A task from a generic CSV or JSON file SHALL carry none. An own export SHALL carry each task's `origin` and the import of an own export SHALL restore it unchanged, so the round trip is equivalent. Origins are written in the import's operations, like every other field.

#### Scenario: TickTick task keeps its id
- **WHEN** a TickTick row with `taskId` `6f1a…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "ticktick", id: "6f1a…"}` and `origin: ticktick` lists it

#### Scenario: Things item keeps its uuid
- **WHEN** a Things to-do with uuid `A1B2…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "things", id: "A1B2…"}`

#### Scenario: Trello card keeps its link
- **WHEN** a Trello card with id `5f3a…` and `shortUrl` `https://trello.com/c/AbCd1234` is imported
- **THEN** the task's origin is `{kind: "import", provider: "trello", id: "5f3a…", url: "https://trello.com/c/AbCd1234"}` and the origin chip opens the card

#### Scenario: Google task keeps its id
- **WHEN** a Google Tasks item with `id` `MTIz…` is imported twice
- **THEN** the first import gives it the origin `{kind: "import", provider: "google-tasks", id: "MTIz…"}` and the second preview reports it as `skip` with reason `already_imported`

#### Scenario: Round trip keeps origins
- **WHEN** an export holding a task captured from a page, a task from email and an imported issue is imported into an empty account
- **THEN** a fresh export lists the three tasks with the same `origin` values as the file

#### Scenario: Generic file has none
- **WHEN** a generic CSV with a `title` column is imported
- **THEN** the created tasks have no origin, and the preview shows no origin column

#### Scenario: Offline device receives origins
- **WHEN** the import finishes while a device is offline and the device later syncs
- **THEN** the imported tasks arrive with their origins as ordinary operations and the chips show on that device

### Requirement: Imported custom fields
A named format whose rows carry typed values beyond the task model (Linear estimates, Asana custom field columns, Trello custom field items) SHALL import them as custom field values of the task's project: for each named value the import SHALL reuse the project's live field definition of that name and type when it exists, or create one (number for numbers, text for text, choice for a single-select value with the options the file shows, checkbox for booleans, date for a date) as part of the same job, so that undoing the import removes the definitions it created and nothing else. A value whose type does not match an existing definition of that name SHALL be dropped with a row warning naming the field. The preview SHALL count the definitions to create under `fields`. A project at its limit of definitions SHALL get no new definition and the row a warning. Tasks that end in the Inbox or in an existing project of another member SHALL receive no field values (a warning names them), since fields belong to a project. Definitions and values are written as operations in the import, applied on the server and reaching every device by sync, like every other imported entity.

#### Scenario: Asana number column
- **WHEN** an Asana CSV has a column "Effort" with the values 2 and 3.5 on two tasks of project "Website"
- **THEN** the import creates a number field "Effort" on "Website" and writes 2 and 3.5 to the two tasks, and the preview counted one definition

#### Scenario: Single-select column becomes a choice
- **WHEN** an Asana CSV column "Stage" holds the values `Draft`, `Review` and `Draft`
- **THEN** the import creates a choice field "Stage" with the options `Draft` and `Review` in first-seen order and writes each task's value

#### Scenario: Existing field of another type
- **WHEN** project "Website" already has a text field "Effort" and the file carries numbers under "Effort"
- **THEN** no definition is created, the values are dropped, and each row warns that "Effort" exists with another type

#### Scenario: Definition limit reached
- **WHEN** the target project already has 30 live field definitions and the file carries a new column
- **THEN** the rows warn that the field cannot be created, the tasks are still imported without that value, and no definition is written

#### Scenario: Undo removes created definitions
- **WHEN** an import that created two field definitions is undone
- **THEN** the definitions and the tasks are removed as one undo, and a definition that existed before the import is untouched

### Requirement: Google Tasks structure
A Google Takeout `Tasks.json` SHALL be recognised by its top-level `items` array of lists each holding `kind` `tasks#taskList` and an `items` array of `tasks#task` objects. Each list SHALL become a project (a list titled "My Tasks" or `@default` SHALL go to the target project, Inbox by default), and an item whose `parent` names another item SHALL become that item's subtask. Items with `deleted` or `hidden` set and a completed status older than the export SHALL still be imported as completed tasks, so a history of done tasks is kept; items with `deleted` true SHALL be skipped with a note counting them.

#### Scenario: Lists and subtasks
- **WHEN** `Tasks.json` has a list "Groceries" with an item "Fruit" and an item "Apples" whose `parent` is "Fruit"
- **THEN** the project "Groceries" is created with "Fruit" as a task and "Apples" as its subtask

#### Scenario: Default list
- **WHEN** a list is titled "My Tasks" and the user chose no target project
- **THEN** its items go to the Inbox and the preview notes it

### Requirement: Google Tasks attributes and dates
A Google Tasks item SHALL keep its `title`, its `notes` as the description, its `status` (`completed` with `completed` as the completion time), and its `due` as a floating due date without a time (Google Tasks stores dates at midnight UTC; the date part SHALL be used as written, never shifted by the import's time zone). A `links` entry SHALL become a link attachment. Google Tasks has no priority, labels or recurrence in the file, so none are produced and nothing is warned.

#### Scenario: Due date is not shifted
- **WHEN** an item has `due` `2026-11-03T00:00:00.000Z` and the import's time zone is `America/Los_Angeles`
- **THEN** the task is due on 2026-11-03 without a time

#### Scenario: Completed item
- **WHEN** an item has `status` `completed` and `completed` `2026-10-01T09:12:00.000Z`
- **THEN** the task is imported completed at that instant

#### Scenario: Malformed item
- **WHEN** an item has no `title` or its `due` is not a timestamp
- **THEN** the row without a title is an error naming the list and position, a bad `due` is a warning and the task is imported without a due date, and with `skip_rows` the rest of the file is still imported

### Requirement: Trello structure
A Trello board JSON export SHALL be recognised by its top-level `id`, `name`, `lists`, `cards` and `checklists` keys. The board SHALL become one project, each open list a section in the board's order (so the project opens as a board on the importing device), each card a task in its list's section, each checklist item a subtask (checked items completed), and the board's labels labels. Cards and lists that are `closed` (archived) SHALL be imported completed and placed in their section; a `closed` list's cards SHALL keep the list as their section. A ZIP of several board exports SHALL be imported as one job.

#### Scenario: Lists become board columns
- **WHEN** a board "Renovation" has lists "To do", "Doing" and "Done" with cards in each
- **THEN** the project "Renovation" has those three sections in that order, each with its cards, and opens as a board on the importing device

#### Scenario: Checklist becomes subtasks
- **WHEN** a card has a checklist "Steps" with two items, one `complete`
- **THEN** the task has two subtasks, one completed

#### Scenario: Archived card
- **WHEN** a card is `closed`
- **THEN** it is imported completed, in its list's section, and the preview counts it as completed

### Requirement: Trello attributes and dates
A Trello card SHALL keep its `name` as the title, its `desc` as the description, its labels (by name; a label with a colour and no name SHALL be named after the colour), its `due` as a floating due date with a time converted from UTC to the import's time zone, `dueComplete` as completed, `start` as the start date, and `dateLastActivity` ignored. Comment actions (`commentCard`) in the export SHALL be appended to the description under a "Comments" heading with their author's name and date, because their authors cannot be kept. Attachments with a URL SHALL become link attachments; uploaded files SHALL be dropped with a warning. Members SHALL be dropped with a warning unless the card's member is the importing user's full name or username, in which case the task stays assigned to them. Custom field items with a number, text, checkbox or list value SHALL become custom field values ("Imported custom fields"). The card's `shortUrl` SHALL be the origin's URL.

#### Scenario: Due with a time
- **WHEN** a card has `due` `2026-11-05T17:00:00.000Z` and the import's time zone is `Europe/Rome`
- **THEN** the task is due 2026-11-05 at 18:00

#### Scenario: Comments kept as text
- **WHEN** a card has two `commentCard` actions
- **THEN** the description ends with a "Comments" heading and one line per comment with the author's name and date, and the row warns once that comment authors cannot be kept

#### Scenario: File attachment dropped
- **WHEN** a card has an attachment that is an uploaded file and another that is a link
- **THEN** the link becomes a link attachment and the file is dropped with a warning naming it

### Requirement: Asana structure
An Asana project CSV export SHALL be recognised by a header containing `Task ID`, `Created At`, `Completed At`, `Last Modified`, `Name`, `Section/Column`, `Assignee`, `Due Date` and `Parent task`. The file's rows SHALL go to one project named after the file (an archive entry's name without its extension) or the target project, `Section/Column` SHALL become sections in first-seen order (and the project opens as a board on the importing device when the file names a column for every task), and a row whose `Parent task` names another row's `Name` SHALL become that row's subtask. The optional `Projects` column SHALL be shown as a note and not create projects, since one file is one project.

#### Scenario: Sections and subtasks
- **WHEN** a CSV has rows in "Backlog" and "In progress", one row with `Parent task` "Write brief"
- **THEN** the project has the two sections and the row is a subtask of "Write brief"

#### Scenario: Parent not in the file
- **WHEN** a row's `Parent task` names no row of the file
- **THEN** the task is imported at the top level with a warning naming the parent

### Requirement: Asana attributes and dates
An Asana row SHALL keep `Name` as the title, `Notes` as the description, `Tags` as labels, `Due Date` as a floating due date (a `Due Time` or a time in the value in the import's time zone when present), `Start Date` as the start date, `Completed At` as completed at that instant, `Created At` as the creation time, and `Priority` (High, Medium, Low) as p1, p2, p3 when the column exists as Asana's built-in field. `Assignee` SHALL be kept only when it is the importing user's email address, otherwise dropped with a warning. Every other column not in the documented list SHALL be treated as a custom field column ("Imported custom fields"): numeric values as a number field, `Yes`/`No` as a checkbox, dates as a date field, at most ten distinct text values across the file as a choice field, otherwise a text field. `Blocked By (Dependencies)` SHALL become dependencies on rows of the same file. Rows with an `Assignee Email` or `Collaborators` column SHALL drop those with a warning.

#### Scenario: Custom column becomes a field
- **WHEN** a CSV has a column "Budget" with numeric values
- **THEN** a number field "Budget" is created on the project and each task carries its value

#### Scenario: Dependencies in the file
- **WHEN** a row's `Blocked By (Dependencies)` names "Order paint" and that row exists in the file
- **THEN** the task waits for the "Order paint" task

#### Scenario: Unreadable date
- **WHEN** a row's `Due Date` is `soon`
- **THEN** the task is imported without a due date and the row warns quoting the value

### Requirement: Microsoft To Do structure
Microsoft To Do has no export of its own. The `microsoft-todo-json` format SHALL read a JSON document holding the Microsoft Graph To Do shape, as written by the script in the switch guide: an array (or a `value` array) of `todoTaskList` objects, each with `displayName`, `wellknownListName` and a `tasks` array of `todoTask` objects (`id`, `title`, `body`, `importance`, `status`, `dueDateTime`, `startDateTime`, `completedDateTime`, `createdDateTime`, `reminderDateTime`, `recurrence`, `categories`, `checklistItems`, `linkedResources`). It SHALL be recognised by the presence of `wellknownListName` or of a task with `importance` and `dueDateTime`. Each list SHALL become a project (the `defaultList` SHALL go to the target project, Inbox by default; the `flaggedEmails` list SHALL become a project "Flagged emails"), each task a task, each checklist item a subtask. The guide SHALL also say that the Outlook data export's tasks file is read when it holds the same objects.

#### Scenario: Lists and checklist items
- **WHEN** the file has a list "Home" with a task "Fix tap" holding two `checklistItems`, one `isChecked`
- **THEN** the project "Home" has the task with two subtasks, one completed

#### Scenario: Default list
- **WHEN** a list has `wellknownListName` `defaultList`
- **THEN** its tasks go to the target project (Inbox by default) and the preview notes it

#### Scenario: Not a To Do file
- **WHEN** a JSON array of objects has neither `wellknownListName` nor tasks with `importance`
- **THEN** it is not detected as `microsoft-todo-json` and the generic JSON profiles decide as before

### Requirement: Microsoft To Do attributes and dates
A To Do task SHALL keep its `title`, its `body.content` as the description (HTML converted to plain text), `importance` `high` as p1, `normal` as p4 and `low` as p4, `status` `completed` with `completedDateTime` as the completion, `categories` as labels, a `linkedResources` entry with a `webUrl` as a link attachment (and, when it is the only one, as the task's origin URL), and `dueDateTime` as a floating due date: Graph writes due dates as midnight in the `timeZone` the object names, so the date part SHALL be taken in that zone and no time set; a `reminderDateTime` SHALL become an absolute reminder at that instant in its named zone. `recurrence` (`pattern` and `range`) SHALL become a rule where the grammar expresses it (daily, weekly on days, monthly on a day, yearly) and otherwise a warning. `startDateTime` SHALL become the start date. Attachments other than links SHALL be dropped with a warning.

#### Scenario: Due date in a named zone
- **WHEN** a task has `dueDateTime` `{dateTime: "2026-11-03T00:00:00.0000000", timeZone: "Pacific Standard Time"}`
- **THEN** the task is due on 2026-11-03 without a time, whatever the import's time zone

#### Scenario: Weekly recurrence
- **WHEN** a task's `recurrence.pattern` is `{type: "weekly", interval: 1, daysOfWeek: ["monday", "wednesday"]}`
- **THEN** the task gets the rule `every monday, wednesday`

#### Scenario: Reminder kept
- **WHEN** a task has `reminderDateTime` `{dateTime: "2026-11-03T09:00:00.0000000", timeZone: "W. Europe Standard Time"}` and `isReminderOn` true
- **THEN** the task has an absolute reminder at 09:00 Central European Time on that day

### Requirement: Apple Reminders file
Apple Reminders has no export of its own. The `apple-reminders-json` format SHALL read the JSON the switch guide's Shortcut writes: an array of objects with `list`, `title`, `notes`, `dueDate`, `isCompleted`, `completionDate`, `creationDate`, `priority`, `flagged`, `tags`, `url`, `identifier`, `parent` and `subtasks` (an array of the same shape), recognised by the presence of `identifier` and `isCompleted` on every object. Each distinct `list` SHALL become a project ("Reminders", the default list, SHALL go to the target project), each object a task, `subtasks` and `parent` references subtasks. The switch guide SHALL say first that a CalDAV connection to the server moves the same data without a file, and present the Shortcut for people who want a one-time copy.

#### Scenario: Lists and subtasks
- **WHEN** the file has reminders in lists "Groceries" and "Work", one with two `subtasks`
- **THEN** two projects are created and the reminder has two subtasks

#### Scenario: Partial Shortcut output
- **WHEN** an object lacks `identifier` or `isCompleted`
- **THEN** the file is not detected as `apple-reminders-json`, and when the format is chosen by hand the row is an error naming the missing key

### Requirement: Apple Reminders attributes and dates
A reminder SHALL keep its `title`, `notes` as the description, `priority` (Apple's 1 high, 5 medium, 9 low, 0 none) as p1, p2, p3, p4, `flagged` as the label `flagged`, `tags` as labels, `url` as a link attachment, `isCompleted` with `completionDate` as the completion, `creationDate` as the creation time, and `dueDate` as a floating due date with its time when the Shortcut wrote one (an all-day reminder has no time). Dates are written by Shortcuts in the device's zone as ISO 8601 with an offset and SHALL be converted to the import's time zone. Repeat rules and location or message triggers are not in the Shortcut output and SHALL be named in the guide as not carried.

#### Scenario: Priority mapping
- **WHEN** a reminder has `priority` 1
- **THEN** the task is p1

#### Scenario: Timed reminder
- **WHEN** a reminder has `dueDate` `2026-11-03T17:30:00+01:00` and the import's time zone is `Europe/Rome`
- **THEN** the task is due 2026-11-03 at 17:30

### Requirement: Any.do file
Any.do has no export of its own. The `anydo-json` format SHALL read the JSON of Any.do's account data request (Settings → Privacy → Request my data), recognised by top-level `categories` and `tasks` arrays whose tasks carry `categoryId`, `globalTaskId` (or `id`) and `status`. Each category SHALL become a project (the category marked `isDefault` SHALL go to the target project), each task a task, a task whose `parentGlobalTaskId` names another a subtask. `docs/import.md` SHALL state that this file was verified on the fixture obtained through that request and that Any.do may change it without notice.

#### Scenario: Categories and subtasks
- **WHEN** the file has categories "Personal" and "Work" and a task whose `parentGlobalTaskId` names another task
- **THEN** two projects are created and the task is a subtask of the named one

#### Scenario: Not an Any.do file
- **WHEN** a JSON document has `tasks` but no `categories` array or no `categoryId` on its tasks
- **THEN** it is not detected as `anydo-json` and the generic JSON profiles decide as before

### Requirement: Any.do attributes and dates
An Any.do task SHALL keep its `title`, its `note` as the description, `priority` `High` as p1 and `Normal` as p4, `status` `CHECKED` or `DONE` as completed (`DELETED` skipped with a count), `dueDate` (Unix milliseconds) as a floating due date in the import's time zone, with its time unless it falls on midnight, `repeatingMethod` (`TASK_REPEAT_DAY`, `_WEEK`, `_MONTH`, `_YEAR`) as a rule, `tags` as labels, `alert` as an absolute reminder, and `creationDate` as the creation time. Shared-list members, attachments and the "moment" plan SHALL be dropped with a warning when present.

#### Scenario: Due at midnight is a date
- **WHEN** a task's `dueDate` is midnight of 2026-11-03 in the import's time zone
- **THEN** the task is due 2026-11-03 without a time

#### Scenario: Weekly repeat
- **WHEN** a task has `repeatingMethod` `TASK_REPEAT_WEEK`
- **THEN** the task gets the rule `every week` from its due date

### Requirement: Import into a chosen workspace
The import options SHALL accept `workspace`, the id of one of the importing account's workspaces, on the preview and on the job. Every project, label and saved view an import creates, and every task it creates without a project, SHALL carry that workspace as its `workspace_id` (no field for the default workspace); tasks in a project follow their project. Existing projects and labels SHALL be reused by name, and open tasks matched as possible duplicates, only within that workspace. Without the option an import SHALL target the default workspace, except an own export, which keeps the per-workspace mapping of "Own export completeness"; with the option an own export SHALL put every item into the chosen workspace and SHALL create no workspace. An id that is not one of the account's workspaces SHALL be refused with 400 `invalid_input` before anything is read or written, without revealing whether the workspace exists; a target project that is not in the chosen workspace SHALL be refused the same way. The imported items are ordinary operations: they reach other devices on their next sync, converge by last-writer-wins, and undo of the job removes them wherever they are. Import needs a connection; offline, the screen disables the choice with the rest of the form.

#### Scenario: Work tasks into Work
- **WHEN** a user with the workspaces "Personal" (default) and "Work" imports a Todoist backup with 12 projects and 40 Inbox tasks, choosing Work
- **THEN** the 12 projects, their labels and the 40 Inbox tasks are in Work on every device after sync, Personal is unchanged, and the preview said "12 new projects into Work"

#### Scenario: Name matching stays in the workspace
- **WHEN** Personal has a project "Errands" and a file with a project "Errands" is imported into Work
- **THEN** a new "Errands" project is created in Work and Personal's project receives no task

#### Scenario: Own export into one workspace
- **WHEN** an own export with the workspaces "Personal" and "Family" is imported into an account, choosing Work
- **THEN** every imported project, label, view and project-less task is in Work, no "Family" workspace is created, and the preview notes that everything goes into Work

#### Scenario: Own export as in the export
- **WHEN** the same export is imported without the workspace option
- **THEN** its workspaces are mapped and created as "Own export completeness" describes

#### Scenario: Unknown or foreign workspace
- **WHEN** the options name a workspace id that does not exist, or one of another account the user is not a member of
- **THEN** the response is 400 `invalid_input` naming `workspace`, no job is created, and the message is the same in both cases

#### Scenario: Target project in another workspace
- **WHEN** the options choose Work and name a target project that is in Personal
- **THEN** the response is 400 `invalid_input` naming `targetProject` and no job is created

#### Scenario: Undo an import into Work
- **WHEN** the user undoes a finished job that imported 5 projects into Work
- **THEN** the 5 projects and their tasks carry `deleted_at` and disappear from Work on every device after sync

#### Scenario: Unauthenticated preview with a workspace
- **WHEN** a preview naming a workspace is sent without a session or bearer token
- **THEN** the response is 401 `unauthorized` and the file is not read

### Requirement: Workspace choice on the Import screen
When the account has more than one workspace, the Import screen SHALL offer a Workspace choice next to the other options, listing every workspace and defaulting to the workspace currently open on the device; for an own export it SHALL also offer "As in the export", first and as the default. The target-project picker SHALL list the projects of the chosen workspace, and the preview SHALL name the chosen workspace ("3 new projects into Work", or "Everything goes into Work"). With one workspace the choice SHALL be hidden and no option sent. The choice is reachable with the keyboard like the other options and disabled offline.

#### Scenario: Default is the open workspace
- **WHEN** the device is in "Work" and the user opens Import and picks a CSV file
- **THEN** the Workspace choice shows Work and the preview reads "… into Work"

#### Scenario: One workspace
- **WHEN** the account has only its default workspace
- **THEN** the screen shows no Workspace choice and the request carries no workspace option

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the Workspace choice is disabled with the rest of the form
