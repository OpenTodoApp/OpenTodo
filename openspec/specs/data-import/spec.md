# data-import Specification

## Purpose
Defines how data enters OpenTodo from files: the accepted formats and their field mapping, the dry-run preview, duplicate detection, the import job with its limits and per-row error reporting, write-through to the operation log so imports sync everywhere, and undo of a whole import.

## Requirements

### Requirement: Accepted import formats
The server SHALL import three kinds of files: the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, and JSON exports of other task managers through named importer profiles documented in `docs/import.md`. The format SHALL be detected from the file content and the detected format SHALL be shown and overridable before anything is written.

#### Scenario: Own export is detected
- **WHEN** a file whose top-level document carries `"format":"opentodo-export"` is uploaded for preview
- **THEN** the preview reports the format `opentodo` and the export version, and no profile choice is required

#### Scenario: CSV with documented columns
- **WHEN** a CSV file whose header row contains at least a `title` column is uploaded
- **THEN** the preview reports the format `csv`, lists recognised and ignored columns, and maps `project`, `section`, `parent`, `priority`, `due_date`, `due_time`, `labels`, `description`, `completed_at` and `created_at` when present

#### Scenario: Unrecognised file
- **WHEN** a file matches neither the own export, CSV, nor any importer profile
- **THEN** the preview is refused with a 400 `unsupported_format` error naming the formats that are supported

### Requirement: Field mapping
Imported rows SHALL map onto the existing entities: projects by case-insensitive name (reusing a non-deleted match), subtasks to `parent_id`, labels to `labels`, priority to 1–4 (default 4), due dates to floating `{date, time?}`, completion to `completed_at`, creation time to `created_at`. Sections SHALL become a label or be ignored, by user choice. Unsupported parts SHALL be dropped with a per-row warning, never silently.

#### Scenario: Date-time with zone becomes floating
- **WHEN** a row carries a due date-time with a time zone offset and the user selected a time zone in the preview
- **THEN** the task's due date and time are the wall-clock values of that instant in the selected time zone

#### Scenario: Subtask references its parent
- **WHEN** a row names a parent that is also part of the same file
- **THEN** the imported child task's `parent_id` is the id assigned to the imported parent, whatever the order of rows

#### Scenario: Unsupported attribute dropped with warning
- **WHEN** a row carries a recurrence rule or an attachment
- **THEN** the task is still imported and the row is marked with a warning naming the dropped attribute

### Requirement: Dry-run preview
`POST /api/v1/import/preview` SHALL accept a file and options and SHALL return, without writing anything, the detected format, totals, and a per-row result stating `create`, `update`, `skip` (with reason) or `error` (with reason and row number or source id). Options SHALL include target project for unassigned tasks, time zone, section handling, duplicate handling (`skip` or `import`), and error handling (`skip_rows` or `abort`).

#### Scenario: Preview reports per-row outcomes
- **WHEN** a CSV with 100 rows of which 3 have an invalid priority is previewed
- **THEN** the response lists 97 rows as `create`, 3 rows as `error` naming the row number and the invalid value, and totals matching those counts

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
`POST /api/v1/import/jobs/{id}/undo` SHALL soft-delete every project and task the job created by writing tombstone operations, SHALL leave entities the job only updated untouched, and SHALL mark the job `undone`. Undo SHALL be idempotent.

#### Scenario: Undo removes created items everywhere
- **WHEN** a user undoes a finished job that created 200 tasks and 4 projects
- **THEN** those entities carry `deleted_at`, disappear from every view, remain in the export, and other devices hide them after their next sync

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
