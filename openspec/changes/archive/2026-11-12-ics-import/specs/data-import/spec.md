## ADDED Requirements

### Requirement: iCalendar task files
The server SHALL import an iCalendar file (RFC 5545) as the format `ics`, reading each `VTODO` with the same mapping as a `VTODO` sent over CalDAV: `SUMMARY` and `DESCRIPTION` as the title and the description, `PRIORITY` with the CalDAV priority table, `DUE`, `DTSTART` and their shapes as the due date, its time and the deadline (a `DTSTART` alone as the start date), `STATUS:COMPLETED` or `CANCELLED` or a `COMPLETED` time as completion at that time, `CREATED` as the creation time, `CATEGORIES` as labels, an `RRULE` the rule grammar can express as the task's repeat rule, `ESTIMATED-DURATION` as the estimate, OpenTodo's own `X-OPENTODO-START`, `X-OPENTODO-EVENING` and `X-OPENTODO-ENERGY` properties, and each display `VALARM` as a reminder. A zoned or UTC time SHALL become the wall time in the import's time zone. A `RELATED-TO` with `RELTYPE=PARENT` or without `RELTYPE` SHALL make the task a subtask of the task with that `UID` in the same file, wherever that task appears in the file, and `RELTYPE=DEPENDS-ON` SHALL make it blocked by that task. A file with `X-WR-CALNAME` SHALL become one project of that name (a live project of that name is reused); a file without it SHALL go to the Inbox or the chosen target project. Each task SHALL carry the origin `{kind: "import", provider: "ics", id: <UID>}`, read as "iCalendar". A `VTODO` the mapping cannot read (no `UID`, a value the mapping refuses, a component cut off before its `END`) SHALL be one row in error with the reason, and the rest of the file SHALL still import; components other than `VTODO` and `VTIMEZONE` SHALL be reported in a file note and not imported; a repeat rule, an alarm, a skipped occurrence (`EXDATE`) or a changed occurrence (`RECURRENCE-ID`) the model cannot hold SHALL be dropped with a row warning. The import screen SHALL list the format as "iCalendar tasks (.ics)" and its file picker SHALL accept `.ics` files. Like every import, the job writes ordinary operations with device `import`: devices that were offline receive the tasks on their next sync and converge under last-writer-wins, and the whole import can be undone.

#### Scenario: Nextcloud list with subtasks
- **WHEN** a Nextcloud Tasks export with `X-WR-CALNAME:Groceries`, a task "Bake a cake" and two tasks with `RELATED-TO;RELTYPE=PARENT:<cake UID>`, one of them before the parent in the file, is imported
- **THEN** a project "Groceries" holds "Bake a cake" with the two tasks as its subtasks, each task's origin is `{kind: "import", provider: "ics", id: <its UID>}`, and a second preview of the same file reports every task as `skip` with reason `already_imported`

#### Scenario: RELATED-TO without RELTYPE
- **WHEN** a `VTODO` has `RELATED-TO:<UID>` with no `RELTYPE` and the file holds a `VTODO` with that `UID`
- **THEN** the task is imported as a subtask of that task

#### Scenario: Repeating task with an alarm
- **WHEN** a `VTODO` with `DUE;TZID=Europe/Berlin:20261120T090000`, `RRULE:FREQ=WEEKLY;BYDAY=FR` and a `VALARM` with `TRIGGER:-PT15M` is imported with the time zone `Europe/Berlin`
- **THEN** the task is due 2026-11-20 at 09:00, repeats every Friday, and has a reminder 15 minutes before its due time

#### Scenario: Completed task
- **WHEN** a `VTODO` with `STATUS:COMPLETED` and `COMPLETED:20261101T100000Z` is imported
- **THEN** the task is created completed at that instant

#### Scenario: Malformed component is skipped and reported
- **WHEN** a file holds three `VTODO`s and one of them has no `UID`
- **THEN** the preview lists that component as an `error` row with the reason, the other two as `create`, and the import creates the two

#### Scenario: Events are not imported
- **WHEN** a file holds `VTODO`s and two `VEVENT`s
- **THEN** the `VTODO`s are imported and a file note says that 2 VEVENT components are not imported

#### Scenario: Preview requires authentication
- **WHEN** an `.ics` file is sent to the preview route without a session or token
- **THEN** the server answers 401 and reads nothing, as for every other format

#### Scenario: A file that is not a calendar
- **WHEN** a file is uploaded with the format `ics` forced but holds no `BEGIN:VCALENDAR`
- **THEN** the preview is refused with a 400 `invalid_file` error saying the file is not an iCalendar file

## MODIFIED Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, and JSON exports of other task managers through named importer profiles. It SHALL also import the export files of these named apps: `todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-db`, `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json`, `anydo-json`, `omnifocus-csv`, `vikunja-export`, `notion-csv`, `super-productivity-json`, `tududi-db` and `ics` (an iCalendar file of tasks). All of them SHALL be documented in `docs/import.md`. The format SHALL be detected from the file content, and the detected format SHALL be shown and overridable before anything is written. A named format SHALL be detected only on a signature distinctive of that app's file, never on a product name alone, so that no file of one format is read as another, and the generic JSON and CSV profiles keep every file they accepted before. A bare CSV file SHALL never be detected as `notion-csv`, but the user MAY choose that format for it.

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

#### Scenario: An iCalendar file is detected
- **WHEN** a file that starts with `BEGIN:VCALENDAR` (after white space and a byte order mark) is uploaded for preview without choosing a format
- **THEN** the preview reports the format `ics`, and every other fixture kept with the tests is still reported in the format it was reported in before
