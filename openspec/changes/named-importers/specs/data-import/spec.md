# Spec Delta

## MODIFIED Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, JSON exports of other task managers through named importer profiles, and the export files of named apps (`todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-json`), all documented in `docs/import.md`. The format SHALL be detected from the file content and the detected format SHALL be shown and overridable before anything is written.

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
- **THEN** the preview reports the format `todoist-csv`, and a TickTick backup, a Linear CSV and a Things export are likewise reported as `ticktick-csv`, `linear-csv` and `things-json`

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

### Requirement: Todoist mapping
A Todoist export SHALL map:
- each project file to a project
- section rows to sections
- task rows to tasks, nested by their indent level into subtasks
- the task priority to the same priority level the user saw in Todoist (Todoist's highest becomes p1)
- labels written in task content to labels
- the description to the description
- date strings, including recurring ones, to due dates and recurrence rules where the rule grammar can express them
- note rows to the task's description, appended under a "Comments" heading, because their authors cannot be kept

Responsible people other than the importing user SHALL be dropped with a warning.

#### Scenario: Nested tasks and sections
- **WHEN** a Todoist CSV contains a section row followed by a task at indent 1 and a task at indent 2
- **THEN** the first task is in that section and the second is its subtask

#### Scenario: Priority as the user saw it
- **WHEN** a task was shown as priority 1 (red) in Todoist
- **THEN** it is imported with priority p1

#### Scenario: Recurring date string
- **WHEN** a task's date is `every monday`
- **THEN** it is imported as a recurring task with the rule `every monday` and its next Monday as due date

### Requirement: TickTick mapping
A TickTick CSV backup SHALL be recognised despite the metadata lines before its header. It SHALL map:
- lists to projects, with folders as parent projects
- the board column name to the section
- tags to labels
- the content to the description, and checklist items to subtasks
- priority (high, medium, low, none) to p1, p2, p3, p4
- due date and time with the export's time zone to a floating due date
- repeat rules (RRULE) to recurrence where expressible
- completed status and time to completion

#### Scenario: Checklist becomes subtasks
- **WHEN** a TickTick task is a checklist with three items, one checked
- **THEN** it is imported with three subtasks, one of them completed

#### Scenario: Folder and list
- **WHEN** a list "Groceries" sits in the folder "Home"
- **THEN** the project "Groceries" is created as a sub-project of "Home"

### Requirement: Linear mapping
A Linear CSV export SHALL map:
- issues to tasks, each in its Linear project, or in a project named after its team when it has none
- the workflow status to a section of that project, so the board shows the same columns
- completed and canceled issues to completed tasks, with canceled ones labelled `canceled`
- priority (urgent, high, medium, low, none) to p1, p2, p3, p4, p4
- labels to labels, the parent issue to the parent task, the due date to the due date
- the Markdown description to the description, keeping the issue identifier (for example `ENG-123`) at its start

Estimates, cycles and assignees other than the importing user SHALL be dropped with a warning.

#### Scenario: Statuses become board columns
- **WHEN** a Linear project has issues in `Todo`, `In Progress` and `In Review`
- **THEN** the imported project has those three sections, each holding its issues, and switching the project to the board shows them as columns

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

### Requirement: Things export shape
`docs/import.md` SHALL publish the JSON shape that `things-json` accepts and the export recipe that produces it from Things. A `things-json` file SHALL map:
- areas to parent projects, projects to projects, headings to sections
- to-dos to tasks, checklist items to subtasks
- tags to labels, notes to the description
- the "when" date to the due date, and repeating to-dos to recurrence where expressible
- logbook items to completed tasks

Deadlines, Someday and This Evening SHALL be dropped with a warning until the data model holds them, and the deadline date SHALL be kept as a line in the description.

#### Scenario: Area with a project and headings
- **WHEN** a Things area "Work" holds a project "Launch" with headings "Prepare" and "Ship"
- **THEN** the project "Launch" is a sub-project of "Work" with sections "Prepare" and "Ship"

#### Scenario: Deadline kept as text
- **WHEN** a to-do has a deadline of 2026-11-30
- **THEN** it is imported with a warning, and its description contains the line "Deadline: 2026-11-30"

### Requirement: Named formats are verified against real exports
Each named app format SHALL be tested against at least one export file produced by that app from a real account, stripped of personal data and kept with the tests. A change to a format's detection or mapping SHALL keep every such file importing with the same rows, warnings and errors unless the change states the difference.

#### Scenario: Regression on a real file
- **WHEN** a contributor changes the Todoist mapping so that a fixture's subtask becomes a top-level task
- **THEN** the importer tests fail and name the fixture and the row
