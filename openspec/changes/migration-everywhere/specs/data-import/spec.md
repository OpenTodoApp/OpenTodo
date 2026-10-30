## MODIFIED Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, and JSON exports of other task managers through named importer profiles. It SHALL also import the export files of these named apps: `todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-db`, `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json`, `anydo-json`, `omnifocus-csv`, `vikunja-export`, `notion-csv`, `super-productivity-json` and `tududi-db`. All of them SHALL be documented in `docs/import.md`. The format SHALL be detected from the file content, and the detected format SHALL be shown and overridable before anything is written. A named format SHALL be detected only on a signature distinctive of that app's file, never on a product name alone, so that no file of one format is read as another, and the generic JSON and CSV profiles keep every file they accepted before. A bare CSV file SHALL never be detected as `notion-csv`, but the user MAY choose that format for it.

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

#### Scenario: Five self-hosted and power-user apps are detected
- **WHEN** an OmniFocus CSV export, a Vikunja data export ZIP, a Notion "Markdown & CSV" export ZIP, a Super Productivity backup JSON or a copy of Tududi's SQLite database is uploaded for preview without choosing a format
- **THEN** the preview reports `omnifocus-csv`, `vikunja-export`, `notion-csv`, `super-productivity-json` or `tududi-db` respectively, and every fixture kept with the tests is still reported in the format it was reported in before

#### Scenario: A bare CSV is not taken for Notion
- **WHEN** a CSV file with a `Name` and a `Status` column, not inside a Notion export ZIP, is uploaded for preview
- **THEN** it is reported as `csv` or as the generic profile it matched before, and `notion-csv` is offered in the format menu

## ADDED Requirements

### Requirement: OmniFocus structure and attributes
An OmniFocus CSV export SHALL be recognised by its header, which starts with `Task ID,Type,Name,Status,Project`, followed by `Context` or `Tags`. Folders SHALL become parent projects and projects SHALL become projects. Each action's dotted `Task ID` SHALL give its parent, so action groups become tasks with subtasks. These columns SHALL be mapped:
- `Context` or `Tags`, split on commas, to labels;
- `Start Date` to the start date;
- `Due Date` to the due date and time;
- `Completion Date` to `completed_at`;
- `Duration` to the estimate;
- `Flagged` to priority 1;
- `Notes` to the description.

A `Dropped` action SHALL be imported completed with a warning. Repeat rules are not in the file, and the preview SHALL say so once as a file-level note.

#### Scenario: Hierarchy from task ids
- **WHEN** a file has project `2` "Move house", action `2.1` "Pack" and action `2.1.1` "Buy boxes"
- **THEN** the project "Move house" is created with "Pack" as a task and "Buy boxes" as its subtask

#### Scenario: Flag and tags
- **WHEN** an action is flagged and has tags `Errands, Phone`
- **THEN** the task has priority 1 and the labels `Errands` and `Phone`

#### Scenario: Unreadable date
- **WHEN** an action's `Due Date` cannot be read
- **THEN** the task is imported without a due date and the row carries a warning naming the value

### Requirement: Vikunja structure and attributes
A Vikunja data export SHALL be recognised by a ZIP holding `VERSION` and a `data.json` array of projects with `id`, `title`, `tasks` and `hex_color`. The export SHALL be mapped as follows:
- Projects SHALL become projects, with `parent_project_id` giving sub-projects, and archived projects SHALL be archived.
- The buckets of a project's first Kanban view SHALL become sections, except its done bucket.
- A task SHALL keep `title`, its `description` as text, `done` and `done_at`, `due_date`, `start_date` as the start date, labels, its subtask and parent relations, and its `blocked` relations as `blocked_by`.
- `priority` SHALL map 5 and 4 to 1, 3 to 2, 2 to 3, and 0 and 1 to 4.
- `repeat_after` SHALL become a recurrence rule when it is a whole number of days, and `repeat_mode` 1 SHALL become a monthly rule.
- Reminders SHALL be kept, absolute or relative to the due or start date.
- Attachments in the ZIP SHALL become file attachments of the task.

Everything else SHALL be dropped with a warning, except display-only colours and percentages, which are dropped silently.

#### Scenario: Buckets become sections
- **WHEN** a Vikunja project has a Kanban view with buckets "Backlog", "Doing" and a done bucket "Done", and a task in "Doing"
- **THEN** the project has sections "Backlog" and "Doing", the task is in "Doing", and no "Done" section is created

#### Scenario: Weekly repeat
- **WHEN** a task has `repeat_after` 604800 and `repeat_mode` 0
- **THEN** the task repeats every 7 days

#### Scenario: Attachment in the archive
- **WHEN** a task lists an attachment whose file is in the ZIP
- **THEN** the task has a file attachment with that name and bytes, owned by the importing account

### Requirement: Notion structure and column mapping
A Notion "Markdown & CSV" export SHALL be recognised by a ZIP whose CSV entries are named with a 32-hex page id suffix. Each database CSV SHALL become a project named after the database, and each row a task. The first column SHALL be the title. The row's Markdown page, when present in the ZIP, SHALL become the description. A parent-item relation SHALL give subtasks. The preview SHALL propose a column for each of the roles status, due, labels, priority, project and notes, guessed from the column names in the six app languages and from the values, and SHALL return them as `columns`. `POST /api/v1/import/preview` and `POST /api/v1/import` SHALL accept `columns` to override the guesses, with a role set to `null` meaning it is not imported. A column name not in the file SHALL be refused with a 400 `invalid_input` error. Columns with no role SHALL be dropped and named once in a file-level note. A Notion date range SHALL set the start date from its first value and the due date from its second.

#### Scenario: Guessed mapping
- **WHEN** a Notion task database with columns `Name`, `Status`, `Due`, `Tags` and `Assignee` is previewed
- **THEN** the preview proposes `Status` as status, `Due` as due and `Tags` as labels, and notes that `Assignee` is not imported

#### Scenario: Changed mapping
- **WHEN** the user sets the due role to the column `Do date` and previews again
- **THEN** the tasks' due dates come from `Do date`, and the commit with the same `columns` imports them that way

#### Scenario: Unknown column
- **WHEN** a preview request names a column `Deadline` that the file does not have
- **THEN** the response is a 400 `invalid_input` error naming the column and nothing is read further

#### Scenario: Page body as description
- **WHEN** a row's page in the export has a body with two paragraphs and a checklist
- **THEN** the task's description holds that Markdown body

### Requirement: Super Productivity structure and attributes
A Super Productivity backup SHALL be recognised by top-level `task` and `project` objects that each have `ids` and `entities`. The backup SHALL be mapped as follows:
- Projects SHALL become projects and tags SHALL become labels, except the built-in `TODAY` tag. A task tagged `TODAY` SHALL be due on the import date, with a warning.
- Tasks and archived tasks SHALL keep the title, notes as the description, completion with `doneOn`, and subtasks.
- `dueDay` or `dueWithTime` SHALL give the due date and time in the preview's time zone.
- `timeEstimate` SHALL give the estimate in minutes, rounded up.
- Each day of `timeSpentOnDay` SHALL become one time entry on that day, starting at 09:00 floating and lasting that day's time, capped at 24 hours with a warning.
- A repeat configuration SHALL become a recurrence rule when the rule grammar can express it, and SHALL be dropped with a warning otherwise.

#### Scenario: Tracked time carries over
- **WHEN** a task has `timeSpentOnDay` `{"2026-10-01": 1800000, "2026-10-02": 3600000}`
- **THEN** the task has two time entries, 30 minutes on 1 October and 60 minutes on 2 October, and the project's tracked time shows 1 h 30 min

#### Scenario: Weekly repeat on weekdays
- **WHEN** a repeat configuration has `repeatCycle` `WEEKLY`, `repeatEvery` 1 and Monday and Thursday set
- **THEN** the task repeats every week on Monday and Thursday

### Requirement: Tududi structure and attributes
A copy of Tududi's SQLite database SHALL be recognised by its `tasks`, `projects`, `areas` and `tags` tables and a `uuid` column on `tasks`. It SHALL be read only, from a private temporary copy deleted after the preview or import, as the Things database is. The database SHALL be mapped as follows:
- Areas SHALL become parent projects, projects SHALL become projects, and tasks SHALL become tasks, with `parent_task_id` giving subtasks.
- Tags SHALL become labels.
- Priority `high`, `medium` and `low` SHALL map to 1, 2 and 3.
- `due_date` SHALL give the due date.
- A `done` or `archived` status SHALL mark the task completed.
- A task's note SHALL become its description, and project notes SHALL be appended to the project's notes.
- A recurrence SHALL become a rule when the grammar can express it.

A database whose tables lack a column the mapping needs SHALL be refused with a 400 `unsupported_format` error naming the Tududi versions tested.

#### Scenario: Area, project and subtask
- **WHEN** the database has area "Home", project "Garden" in it, a task "Plant tulips" and a subtask "Buy bulbs"
- **THEN** "Home" is a parent project of "Garden", which holds "Plant tulips" with "Buy bulbs" as its subtask

#### Scenario: Unknown schema
- **WHEN** a SQLite file has a `tasks` table without the columns the mapping needs
- **THEN** the preview is refused with a 400 `unsupported_format` error and the temporary copy is deleted

### Requirement: Switching from another app
The Import screen SHALL offer a **Switching from…** picker, built with the shared Combobox, listing every app in the migration matrix. Choosing an app SHALL do three things:
- set the format override to that app's format, while still warning when the file is detected as another format;
- show the export steps of that app's switch guide inline, taken from the guide's `#export` section in the bundled help;
- link to the full guide.

With no app chosen, the screen SHALL behave as before. The picker SHALL be disabled while offline, like the file picker. On an account with end-to-end encryption it SHALL say that imported text is written in plaintext until an unlocked device re-encrypts it, and that duplicates of encrypted names cannot be detected. Every step SHALL be reachable with the keyboard. Because the picker only fills existing import options, it adds no route. The import routes' authentication is unchanged.

#### Scenario: Choose an app
- **WHEN** the user opens Import data, chooses "Vikunja" in Switching from… and picks a file
- **THEN** the Vikunja export steps are shown above the file picker, the preview uses `vikunja-export`, and a "Full guide" link opens `docs/switch/vikunja.md`

#### Scenario: Wrong file for the chosen app
- **WHEN** the user chose "Notion" and picks a Todoist backup ZIP
- **THEN** the preview warns that the file looks like `todoist-backup` and offers to switch to that format

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the picker and the file picker are disabled and the screen explains that import needs a connection

#### Scenario: Unauthenticated preview
- **WHEN** a preview with a format chosen through the picker is sent without a session or bearer token
- **THEN** the response is a 401 `unauthorized` error and the file is not read

### Requirement: Every listed competitor has a verified path
`docs/switch/README.md` SHALL hold a migration matrix with one row per app: Todoist, TickTick, Things, OmniFocus, Any.do, Microsoft To Do, Google Tasks, Apple Reminders, Vikunja, Trello, Asana, Notion, Super Productivity, Tududi and Linear. Each row SHALL give the format id, what comes with you, what stays behind, and the date and app version of the last check against a real export. A repository check SHALL fail when an app of that list has no row, or its format id is not a format of the importer, or it has no switch guide with an export section, or it has no fixture from a real account with a golden preview. The release preparation for 1.0 and later SHALL fail when any row's last check is more than 120 days older than the release date.

#### Scenario: Missing fixture
- **WHEN** a contributor adds the Tududi row but no `internal/importer/testdata/tududi-db/*.golden.json`
- **THEN** `make repo-check` fails naming Tududi and the missing fixture

#### Scenario: Stale check at release
- **WHEN** `make release-prepare` runs for 1.0.0 and the OmniFocus row was last checked 200 days before
- **THEN** the release preparation fails naming the row, and ordinary pull request checks are not affected

#### Scenario: Matrix is complete
- **WHEN** a reader opens Switch from another app
- **THEN** every one of the fifteen apps has a row and a guide, and none says "not supported"
