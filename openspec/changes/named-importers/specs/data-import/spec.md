# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
A Linear issue SHALL be completed when it was completed or canceled, with canceled ones labelled `canceled`. Its priority (urgent, high, medium, low, none) SHALL map to p1, p2, p3, p4, p4. Labels, the due date and the Markdown description SHALL be kept, the description starting with the issue identifier. An issue assigned to the importing user's email address SHALL stay assigned to them. Estimates, cycles, milestones, relations and other assignees SHALL be dropped with a warning.

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

#### Scenario: Identifier kept
- **WHEN** issue `ENG-123` is imported
- **THEN** its description starts with `ENG-123`

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
A Things to-do's start ("when") date SHALL become its due date, repeating to-dos SHALL become recurring tasks where expressible, and completed or canceled items SHALL be completed tasks. A deadline SHALL become the task's deadline (OpenSpec change `deadlines`). Someday and This Evening SHALL be dropped with a warning until the data model holds them.

#### Scenario: Deadline imported
- **WHEN** a to-do has a deadline of 2026-11-30
- **THEN** the task's deadline is 2026-11-30, its description has no "Deadline:" line and the row has no deadline warning

### Requirement: Named formats are verified against real exports
Each named app format SHALL be tested against at least one export file produced by that app from a real account, stripped of personal data and kept with the tests. A change to a format's detection or mapping SHALL keep every such file importing with the same rows, warnings and errors unless the change states the difference.

#### Scenario: Regression on a real file
- **WHEN** a contributor changes the Todoist mapping so that a fixture's subtask becomes a top-level task
- **THEN** the importer tests fail and name the fixture and the row
