---
title: Import formats
summary: Every import format in detail: your own export, CSV and other apps' JSON exports, mapping rules, duplicates and undo.
audience: user
section: Reference
specs: [data-import]
screens: []
order: 60
---
# Import formats

OpenTodo imports tasks, projects, sections, recurrence rules and reminders from files: its own JSON export (for moving between instances or recovering), CSV from a spreadsheet or a script, and the JSON exports of other task managers. Open **Settings → Data → Import data** in the web app (or press `g` then `Shift+I`), or drive the same endpoints from a script; see [API](#api) below.

Every import works in two steps:

1. **Preview.** The server reads the file and reports, row by row, what would happen: `create`, `update`, `skip` (with a reason) or `error` (with the row number and the reason), with totals that also count new sections, recurring tasks and reminders, and file-level notes (for example comments that are not imported). Nothing is written.
2. **Import.** The server runs the import as a background job. Every created or changed field becomes an ordinary operation in the op log, stamped with server time and the device id `import`, so every device receives the imported data on its next sync under the usual last-writer-wins rules. A whole import can be undone later.

Import runs on the server, so it needs a connection: the Import screen disables the file picker while offline and keeps showing the last loaded job list.

## Formats

The format is detected from the content, in this order; the preview shows what was detected and the `format` option overrides it.

| Format id | Recognised by | Notes |
| --- | --- | --- |
| `opentodo` | a top-level `"format": "opentodo-export"` | Exact round trip, see below |
| `things-db` | a SQLite database with Things 3's tables | a copy of Things' `main.sqlite`, see [Things](#things-database-things-db) |
| `json-items` | top-level `items` and `projects` arrays | "projects / sections / items" backups |
| `json-lists` | a top-level `lists` array | lists of tasks; each list becomes a project |
| `json-generic` | a top-level array of objects, or a `tasks` array | a generic task list |
| `todoist-csv` | a header starting with `TYPE` and containing `CONTENT`, `PRIORITY`, `INDENT` | one project exported from Todoist, see [Todoist](#todoist-todoist-csv-todoist-backup) |
| `todoist-backup` | a ZIP of `todoist-csv` files | Todoist's backup of every project |
| `ticktick-csv` | a preamble starting with `Date:`, then a `Folder Name, List Name, Title, Kind` header | TickTick's CSV backup, see [TickTick](#ticktick-ticktick-csv) |
| `linear-csv` | a header with `ID`, `Team`, `Title`, `Status`, `Priority` and `UUID` | Linear's workspace export, see [Linear](#linear-linear-csv) |
| `csv` | a header row with a `title` column | the documented columns below |

**ZIP files.** A ZIP whose files are all of one format is imported as one job, one preview and one undo; each preview row shows the file it came from. Folders, `__MACOSX/` and hidden files are skipped. An archive with more than 1,000 files, mixed formats, an unsafe file name, or more than ten times the upload limit when unpacked is refused with `400 invalid_file` before anything is written. A zipped `Things Database.thingsdatabase` folder is read as a [Things database](#things-database-things-db).

A file matching none of these is refused with `400 unsupported_format`, naming the supported formats. If a JSON export from another app is not recognised, convert it to the CSV columns below; every field the data model holds can be expressed there.

### Own export (`opentodo`)

The file from **Settings → Data → Download export** or `GET /api/v1/export`. Labels, projects (with their sub-project tree), sections, custom field definitions (`fields`, deleted ones included), tasks (with subtasks, completion, tombstones and their `fields` values), reminders and saved views are recreated with their original ids and field values, so importing an export into an empty account and exporting again gives an equivalent file (comments aside, see below).

Because ids are kept, nothing needs remapping: a task's `section_id`, a recurring series and its occurrence records (`series_id`, whose ids are derived from the series id), a reminder's `task_id`, a task's `blocked_by` and a dashboard's `panels` all point at the same entities as before. Every task field is carried: `recurrence` (stored in canonical form, for example `Every  Monday` becomes `every monday`), `series_id`, `section_id`, `notes_doc` (rich-text notes), `due` including a zoned `tz`, `estimate_minutes`, `ical_extra` and every custom field value in `fields`, including values of definitions that were deleted or belong to another project. The preview counts the definitions it creates as `fields`.

What is handled differently, and why:

- **Comments are not imported.** A comment keeps its author, and the sync engine only accepts comments whose `author_id` is the account writing them; the authors in an export are accounts of the exporting instance (and other members of shared projects). Comment creation is also rate-limited per account. Rewriting every comment to you would misattribute other people's words, so the preview shows a note such as "12 comments are not imported" and nothing is written for them.
- **Assignees** are kept only when they are you (a restore into the same account). Any other `assignee_id` names an account that is not a member here, so it is dropped with a warning on the task.
- **Reminders** keep their `delivered_at` and `dismissed_at`, so a reminder that already went off stays quiet. A live reminder whose time has already passed and that was neither delivered nor dismissed for that time is imported **dismissed at import time** (with a warning), so restoring an old export does not push a burst of stale notifications. Future reminders fire normally. A reminder whose task is neither in the file nor in your account is an error row.
- **Attachments** keep their ids, names and types and become yours: `author_id` is rewritten to you, `comment_id` is cleared (comments are not imported) and `uploaded_at` is set by the server once the file is stored. Links are always imported. A file needs the ZIP export (`GET /api/v1/export?format=zip`): the importer reads `export.json` and the files under `attachments/<id>/<name>`, checks each file against its `size` and `sha256`, and applies the server's per-file limit and your attachments total; a file that does not fit is left out and listed among the job's errors. From the JSON alone, file attachments are skipped and the preview says how many ("3 file attachments are not imported").
- The read-only `role` and `owner_id` the export adds to shared projects are not data and are skipped silently; the end-to-end encryption key record is not imported.

A **template file** is an own export with one more top-level key, `"template": {"day": "YYYY-MM-DD"}`, written by **Save as template…** (OpenSpec `project-templates`). Import treats it like any export (it creates the contents once, with the file's ids and dates) and adds a note to the preview pointing to **From a template…**, which makes a fresh copy on the device with new ids and dates moved so `template.day` lands on the chosen start day. A file without `template` (such as the downloads on the website) uses the date of `exportedAt` as its reference day there. See [Templates](import-export.md#templates).

When an id already exists in the account the row is skipped (`exists`), unless the `existing` option is `overwrite`: then only fields whose value differs are written (`update`), and fields that are unchanged keep their original clock, so a concurrent edit on a device is not clobbered needlessly. An entity that is deleted in the account is never resurrected (`skip`, reason `deleted`). Fields unknown to this server version are dropped with a warning.

### Todoist (`todoist-csv`, `todoist-backup`)

Todoist exports one project as CSV from the project's menu, and keeps backups of every project as a ZIP in its settings (Backups). The backup is the better choice: its file names carry the project names (`Work [2203306141].csv`), so projects keep their names. A single CSV does not name its project, so its tasks go to the target project.

| Todoist | Becomes |
| --- | --- |
| each file in the backup | a project (the `Inbox` file goes to your Inbox or the target project) |
| `meta` row `view_style=board` | the project opens as a board on the device that imports it |
| `section` row | a section of the project |
| `task` row, `INDENT` 1, 2, 3 … | a task; deeper indents are subtasks of the task above |
| `PRIORITY` 1–4 | priority p1–p4 (1 is Todoist's red flag) |
| `@label` in `CONTENT` | a label, removed from the title |
| `DESCRIPTION` | the description |
| `DATE` with `DATE_LANG` | the due date (and time); recurring dates become a rule, see below |
| `DURATION` in minutes | the estimate |
| `REMINDER_OFFSET` / `REMINDER_DATE` | a relative or absolute reminder (an absolute one in the row's `TIMEZONE`) |
| `note` row | appended to the task's description under "Comments" (with a warning) |
| `DEADLINE` | the task's [deadline](tasks-and-projects.md#deadlines), read with `DEADLINE_LANG` like `DATE`; a value that cannot be read is kept as a "Deadline: …" line in the description (with a warning) |
| `RESPONSIBLE` | dropped with a warning |

`DATE` is the text Todoist showed, in the language named by `DATE_LANG` (English, German, French, Italian, Spanish or Portuguese): `Oct 21`, `21 Okt.`, `21 de octubre de 2027 15:00`, `tomorrow`, `every monday`, `jeden Montag`, `alle 2 Wochen`. A date without a year takes the year of the export (the newest file time in the backup, otherwise the day you import). A recurring date becomes a rule whose first date is the next occurrence. A date that cannot be read leaves the task without a due date and adds a warning quoting it.

### TickTick (`ticktick-csv`)

TickTick's backup is one CSV, created from its settings (Backup). It starts with a few lines of metadata (the export date, the version and a status legend) before the header; the importer skips them.

| TickTick | Becomes |
| --- | --- |
| `Folder Name` | a parent project |
| `List Name` | a project inside its folder (`Inbox` goes to your Inbox or the target project) |
| `View Mode` `kanban` | the project opens as a board on the importing device |
| `Column Name` | the section |
| `Kind` `CHECKLIST` with item lines in `Content` | a task with one subtask per item; checked items are completed |
| `parentId` | the parent task |
| `Tags` | labels |
| `Content` | the description |
| `Priority` 5 / 3 / 1 / 0 | p1 / p2 / p3 / p4 |
| `Due Date`, `Is All Day`, `Is Floating`, `Timezone` | the due date (and time) as you saw it in TickTick |
| `Reminder` | reminders (for example `-PT15M`); on an all-day task the trigger counts from midnight, so `PT9H` fires at 09:00 on the day |
| `Repeat` (RRULE) | a recurrence rule, when the grammar can express it |
| `Status` 2 / -1 | completed / completed with the label `canceled` (abandoned) |

### Linear (`linear-csv`)

Linear exports a workspace's issues as CSV from its workspace settings (Import / Export).

| Linear | Becomes |
| --- | --- |
| `Project` (or `Team` when there is none) | a project, which opens as a board on the importing device |
| `Status` | a section, in the order statuses first appear, so the board shows the same columns |
| `Title`, `Description` | the title, and the description starting with the issue identifier (`ENG-123`) |
| `Priority` Urgent / High / Medium / Low / No priority | p1 / p2 / p3 / p4 / p4 |
| `Labels` | labels |
| `Due Date` | the due date |
| `Parent issue` | the parent task |
| `Completed` / `Canceled` | completed / completed with the label `canceled` |
| `Assignee` | kept when it is your own email address, otherwise dropped with a warning |
| `Blocked by` | the issues it waits for become [Blocked by](tasks-and-projects.md#wait-for-another-task), when they are in the same file; others are dropped with a warning |
| `Estimate`, cycles, milestones, initiatives, SLA, `Related to`, `Duplicate of` | dropped with a warning |

### Things database (`things-db`)

Things 3 has no export, but its database can be copied, as Cultured Code's support article "Accessing the Things database" explains. Quit Things first. On a Mac, open `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/`, then the `ThingsData-…` folder, and copy `Things Database.thingsdatabase`. Upload its `main.sqlite` (right-click the folder and choose **Show Package Contents**), or a ZIP of the whole folder. On iPhone or iPad the article describes a diagnostics code that sends `Things Database.aar`; tap it to unpack it into the same folder.

The file is read from a private copy on the server, read-only, using only Things' own tables, and deleted after the preview or import. A SQLite file that is not a Things database is refused with `400 invalid_file`.

| Things | Becomes |
| --- | --- |
| area | a parent project |
| project | a project inside its area |
| heading | a section of its project |
| to-do | a task in its project (or area, or your Inbox) |
| checklist item | a subtask; checked items are completed |
| tag (nested tags as `parent/child`) | a label |
| notes | the description |
| start date ("When") | the due date; a reminder time becomes a reminder |
| repeating to-do | a recurrence rule, when the grammar can express it |
| completed / canceled | completed / completed with the label `canceled` |
| deadline | the task's deadline |
| Someday | the task is [parked](tasks-and-projects.md#when-a-task-starts) (a Someday to-do that also has a date keeps the date, with a warning) |
| This Evening | the task's evening flag |
| trashed items | skipped |

### CSV (`csv`)

UTF-8, with a header row. Comma, semicolon and tab separators are detected from the header; quote fields that contain the separator. Header names are case-insensitive and spaces or dashes count as underscores (`Due Date` is `due_date`). Only `title` is required.

| Column | Also accepted | Value |
| --- | --- | --- |
| `title` | `task`, `content`, `summary` | required |
| `description` | `notes`, `note` | text |
| `project` | `list`, `project_name` | project name; an existing project with the same name (ignoring case) is reused, otherwise one is created |
| `section` | | a section of the task's project (or a label, or ignored, by option); see [Sections](#sections) |
| `parent` | `parent_id` | the `id` of another row, or the title of exactly one row: the task becomes its subtask |
| `id` | `source_id` | your identifier for the row, used by `parent` and to recognise a repeated import |
| `priority` | | `1`–`4` or `p1`–`p4` (1 highest); also `high`, `medium`, `low`, `none`; blank = 4 |
| `due_date` | `due` | `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS]` (floating) or with a `Z`/offset (converted to the chosen time zone) |
| `due_time` | | `HH:MM`; requires `due_date` |
| `labels` | `tags`, `label` | comma-separated label names; missing labels are created |
| `completed_at` | | a date, date-time or Unix time (milliseconds; seconds are recognised); `true`/`yes`/`x`/`1` means "completed now" |
| `completed` | `done` | `true`/`yes`/`x`/`1` marks the task completed at import time |
| `created_at` | `created` | like `completed_at`; defaults to the import time |
| `recurrence` | `repeat`, `repeats`, `recurring`, `rrule` | a recurrence rule, an RRULE or a common spelling; see [Recurrence](#recurrence) |
| `reminder` | `reminders` | one or more reminders separated by `;`, `,` or `\|`; see [Reminders](#reminders) |
| `start` | `start_date` | `someday` parks the task, a date `YYYY-MM-DD` defers it until that day; with a `due_date` too, Someday is dropped with a warning |
| `evening` | | `true`/`yes`/`x`/`1` marks the task for This Evening |
| `deadline` | | the day the task must be finished by, `YYYY-MM-DD`; a date-time keeps its date (with a warning); anything else is a row error |
| `attachment` | `attachments`, `files`, `links` | one or more `http(s)` addresses separated by `;`, `,` or `\|`, each kept as a link attachment; anything else is dropped with a warning |
| `blocked_by` | `depends_on`, `waits_for` | the rows this task waits for, by `id` or by a unique title, separated by `;`, `,` or `\|`; a row that is not in the file, or one that would make tasks wait for each other, is dropped with a warning |

Columns named `comment(s)` or `assignee` are recognised as unsupported: a non-empty value is dropped with a warning on that row. Any other column is listed as ignored in the preview.

Rows are numbered like the file's lines (the header is row 1). A row with an invalid value is an `error` naming the row and the value, for example `row 35: invalid priority "urgent!" (expected 1-4 or p1-p4)`.

```csv
id,title,project,section,parent,priority,due_date,due_time,labels,recurrence,reminder
1,Write report,Work,Q4,,p1,2026-10-20,14:30,"focus, deep",,30m before
2,Collect numbers,Work,Q4,1,2,2026-10-18,,,,
3,Water plants,,,,,,,home,every week,
4,Standup,Work,Daily,,,2026-10-13,09:30,,every weekday,15
```

### `json-generic`

A top-level array of task objects, or an object with a `tasks` array and an optional `projects` array (`{id, name, parent_id, description}`; `parent_id` makes sub-projects, and `description`, `notes` or `note` becomes the project's note when the project is created; an existing project with that name keeps its own note). Key names are matched leniently:

| Task attribute | Keys read |
| --- | --- |
| title | `title`, `name`, `content`, `summary`, `text` |
| description | `description`, `notes`, `note`, `body` |
| project | `project_id` (an id from `projects`), or `project` / `project_name` / `list` (a name) |
| section | `section`, `section_name`, `column`, `heading` |
| parent | `parent_id`, `parent`, or nesting under `subtasks` / `children` |
| priority | `priority`: 1–4, `p1`–`p4`, `high`/`medium`/`low`/`none` |
| due | `due`, `due_date`, `dueDate`: a string, or `{date, time?}` / `{datetime}` |
| deadline | `deadline`: a date string; a date-time keeps its date (with a warning) |
| labels | `labels`, `tags`: strings, `{name}` objects or a comma-separated string |
| completion | `completed`, `done`, `checked` (booleans), `status: "completed"`, and `completed_at` / `completedAt` for the time |
| created | `created_at`, `createdAt`, `created` |
| recurrence | `recurrence`, `rrule`, `repeat`, `recurring`, `recurrence_rule`, `recurrenceRule`, `repeatRule`, or a `due` object with `is_recurring` and its `string`; a string, an array of RRULE strings or a `{frequency, interval, days}` object |
| reminders | `reminders`, `reminder`, `alarms`, `reminder_at`, `remind_at`, `reminderDateTime`: one value or an array |
| attachments | `attachments`, `files`, `attachment`: strings or `{name, url}` objects; `http(s)` addresses become link attachments, anything else is dropped with a warning |

### `json-items`

An object with `projects`, `sections`, `items` and optionally `labels`, `notes` and `reminders` arrays joined by ids.

| Source | Becomes |
| --- | --- |
| `projects[].name`, `parent_id` | project and sub-project; the source inbox (`inbox_project: true`) maps to the target project |
| `projects[].description` (or `notes`, `note`) | the project's note, for created projects only |
| `items[].content`, `description` | title, description |
| `items[].project_id`, `section_id` | project, section |
| `sections[]` | sections of their project, created even when empty, in file order (with `sections: section`; deleted ones are skipped) |
| `items[].parent_id` | subtask |
| `items[].priority` | counted upwards in the source: 4 → 1, 3 → 2, 2 → 3, 1 → 4 |
| `items[].due.date` | due date (date-times with a zone are converted) |
| `items[].due.is_recurring`, `due.string` | recurrence rule from the due string (`every tue 4pm` → `every tuesday`, `every! 2 weeks` → `every 2 weeks after completion`); a string that cannot be expressed is a warning |
| `reminders[]` (`item_id`) | `type: "relative"` with `minute_offset` → reminder that many minutes before the due time; `type: "absolute"` with `due.date` → reminder at that time; `location` reminders and `is_deleted` ones are dropped (location with a warning) |
| `items[].labels` | label names |
| `items[].checked`, `completed_at`, `added_at` | completion, completion time, creation time |
| `deadline` (`{date}`) | the task's deadline |
| `notes[]`, `duration` | dropped with a warning on the item |

Items and projects marked `is_deleted` are skipped.

### `json-lists`

`{"lists": [{"id", "title", "tasks": [...]}]}`; each list becomes a project with its title. Tasks read `title`, `notes` (description), `due` (RFC 3339; converted to the chosen time zone), `status: "completed"` and `completed` (completion time), `parent` (a task id) or nested `subtasks`, and `starred` / `important` (priority 1). `recurrence` (string, RRULE array or `{pattern: {type, interval, daysOfWeek}}`) becomes a rule and `reminderDateTime` (or the other reminder keys of `json-generic`) a reminder. `links` are dropped with a warning; tasks marked `deleted` are skipped.

## Mapping rules

- **Projects** are matched by name, ignoring case, against existing non-deleted projects; otherwise created. Tasks without a project go to the target project (option) or the Inbox.
- **Sections**: see [Sections](#sections).
- **Recurrence** and **reminders**: see [Recurrence](#recurrence) and [Reminders](#reminders).
- **Subtasks** are resolved after the whole file is read, so row order does not matter. A subtask joins its parent's project. A parent that is missing, invalid or would form a cycle leaves the task at the top level with a warning.
- **Labels** are matched by name, ignoring case; missing ones are created.
- **Dates**: plain dates stay dates; date-times without a zone keep their wall clock; date-times with a zone become the wall clock of that instant in the chosen time zone (default: the browser's zone in the web app, UTC through the API). Due dates are always stored floating. A deadline is a date only: a time on it is dropped with a warning, keeping the day as written. The preview counts the tasks that get a deadline.
- **Completion**: a completed row keeps its source completion time, or the import time when the source has none.
- **Unsupported attributes** (attachments that are not web addresses, comments, assignees, links, location reminders, recurrence rules the grammar cannot express) never block a row: the task is imported and the row carries a warning naming what was dropped.

### Sections

With `sections: section` (the default) a row's section becomes a real section of the task's project: an existing live section with the same name (ignoring case) is reused, otherwise one is created once per project, after the existing ones. A subtask's section is looked up in the project it ends up in. Tasks without a project (the Inbox, when no target project is chosen) cannot hold sections, so their section becomes a label, with a warning. `sections: label` turns every section into a label named like it (the behaviour before sections existed), `sections: ignore` drops them. Re-importing a file finds the sections it created by name (and, for `json-items`, by source id), so nothing is duplicated.

### Recurrence

A recurrence becomes a rule of the [recurrence grammar](recurrence.md), stored in canonical form, when the grammar can express it. Accepted, in this order:

1. The grammar itself: `every day`, `every 2 weeks`, `every monday, friday`, `every 15th`, `every last friday`, `every 3 days after completion`, `… until 2027-01-01`, `… for 10 times`.
2. An iCalendar RRULE, with or without the `RRULE:` prefix (`FREQ=WEEKLY;INTERVAL=2`, `FREQ=MONTHLY;BYDAY=-1FR`), when it maps exactly onto a rule (as for [CalDAV](caldav.md)).
3. Common spellings: `daily`, `weekly`, `monthly`, `yearly`, `annually`, `biweekly`, `fortnightly`, `every other day|week|month|year`, `weekdays`, `every workday`, `every weekend`, `each …` and `ev …` for `every …`, and `every! …` for "after completion" (`every! 3 days` → `every 3 days after completion`). A trailing time of day (`every tue 4pm`, `every day at 09:00`) is removed: the due time carries it.
4. A structured object `{frequency|freq|type|unit, interval, days|daysOfWeek|byday}` (also under `pattern`), e.g. `{"frequency": "weekly", "days": ["MO", "TH"]}` → `every monday, thursday`, and an array of RRULE strings.

Anything else (hourly rules, `starting …`, `every other monday`, an interval combined with weekdays, free text) is shown in the preview as a warning on the row, `recurrence "every 3 hours" not supported; imported without a rule`, and the task is imported without a rule. A recurring task without a due date gets the rule's first date from today in the chosen time zone, as in the app. Imported recurring tasks are series of their own (no `series_id`).

### Reminders

Reminders are created together with their task (a task that is skipped, for example as already imported, brings none) and belong to you, like every reminder.

| Value | Becomes |
| --- | --- |
| a number, or a string of digits | relative reminder that many minutes before the due time |
| `30m`, `1h`, `2 days`, `15 min before` | relative reminder before the due time |
| an ISO 8601 duration (`-PT15M`, `-P1D`) | relative reminder; a negative duration is before the due time |
| a date-time (`2026-10-20T08:00`, with or without zone) or a date | absolute reminder at that time (floating values in the chosen time zone, a date at 09:00) |
| an object with `offset_minutes` (negative = before), `minute_offset` / `minutes_before` (minutes before) or `offset` / `trigger` (a duration) | relative reminder |
| an object with `datetime`, `at`, `remind_at`, `fire_at`, `time`, `date` or `due.date` | absolute reminder |
| `type: "location"` | dropped with a warning |

A relative reminder fires at the due time plus its offset, with a date-only due counting as 09:00, in the chosen time zone. On a task without a due date it is kept but does not fire (the row says so). A reminder whose time has already passed at import time is imported dismissed, with a warning, so no stale notification is sent. Offsets beyond one year are dropped with a warning.

## Duplicates

Checked in this order:

1. Own export: an id that already exists is `skip` (`exists`) or, with `existing: overwrite`, `update`.
2. A source row recorded by an earlier, not undone import of the same format for this account is `skip` (`already_imported`). Importing the same file twice therefore creates nothing the second time. CSV rows without an `id` column are recognised by their content.
3. A row whose title (trimmed, ignoring case), project and due date match an existing open task is `skip` (`possible_duplicate`), unless the `duplicates` option is `import`, in which case it is created with a warning.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `format` | a format id from the table above | detected |
| `targetProject` | id of one of your projects | Inbox |
| `timeZone` | IANA zone, e.g. `Europe/Rome` | `UTC` (the web app sends the browser zone) |
| `sections` | `section`, `label`, `ignore` | `section` |
| `duplicates` | `skip`, `import` | `skip` |
| `errors` | `skip_rows`, `abort` | `skip_rows` |
| `existing` | `skip`, `overwrite` (own export only) | `skip` |

With `skip_rows`, bad rows are reported and everything else is imported; a bad row never leaves a partial task. With `abort`, any row in error fails the job before anything is written and names the first bad row.

## Jobs, limits and undo

- One import job per account runs at a time; starting a second one answers `409 conflict` naming the running job.
- Files may be at most `OPENTODO_IMPORT_MAX_MB` megabytes (default 20, allowed 1–200) and 50,000 rows; larger files answer `413 too_large`.
- Ops are written in batches of at most 1,000 and progress is saved after each batch. If the server restarts mid-import, the job shows `failed` with the counts of what was written, and undo removes it.
- **Undo** tombstones every project, task, label, section, reminder and saved view the job created, through the op log: they disappear from every view and from other devices after their next sync, and stay in the export with `deleted_at`. Entities the job only updated are left alone. As when deleting in the app, open tasks you later added to an undone project move to the Inbox, open tasks you later put into an undone section move to "No section", and undone labels are removed from your other tasks. Undo is idempotent. After an undo the same file can be imported again.
- **Webhooks** see an import as one `import.completed` delivery per finished job and one `import.undone` per undo, not one event per task. See [Webhooks → Imports](webhooks.md#imports).

Job records (status, options, counts, row errors) are operational metadata kept in the server database; they are not part of the export.

### Memory

The preview reads the whole file once. CSV is streamed record by record; a JSON file is decoded in one piece and takes roughly five times its size in memory, so the largest default file (20 MB of JSON) peaks around 100–120 MB during the preview and the start of the job, released afterwards. Typical imports of a few thousand rows stay under 10 MB. On a 1 GB Raspberry Pi keep the default or lower `OPENTODO_IMPORT_MAX_MB`.

## API

All routes require a session or a bearer token, like the rest of the API. Uploads are `multipart/form-data` with a `file` part and the options either as one JSON `options` part or as individual fields named like the options.

```bash
# Preview (nothing is written)
curl -sS "$OT/api/v1/import/preview" -H "Authorization: Bearer $TOKEN" \
  -F file=@tasks.csv -F timeZone=Europe/Rome

# Start the job → 202 {"job": {"id": "…", "status": "running", …}}
curl -sS "$OT/api/v1/import" -H "Authorization: Bearer $TOKEN" \
  -F file=@opentodo-export.json -F 'options={"existing":"overwrite"}'

# Follow it, list jobs, undo
curl -sS "$OT/api/v1/import/jobs/<id>" -H "Authorization: Bearer $TOKEN"
curl -sS "$OT/api/v1/import/jobs" -H "Authorization: Bearer $TOKEN"
curl -sS -X POST "$OT/api/v1/import/jobs/<id>/undo" -H "Authorization: Bearer $TOKEN"
```

See [docs/api.md](api.md#import) for the response shapes and error codes.
