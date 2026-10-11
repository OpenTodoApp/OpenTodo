# Importing data

OpenTodo imports tasks and projects from files: its own JSON export (for moving between instances or recovering), CSV from a spreadsheet or a script, and the JSON exports of other task managers. Open **Settings → Import data** in the web app (or press `g` then `Shift+I`), or drive the same endpoints from a script; see [API](#api) below.

Every import works in two steps:

1. **Preview.** The server reads the file and reports, row by row, what would happen: `create`, `update`, `skip` (with a reason) or `error` (with the row number and the reason). Nothing is written.
2. **Import.** The server runs the import as a background job. Every created or changed field becomes an ordinary operation in the op log, stamped with server time and the device id `import`, so every device receives the imported data on its next sync under the usual last-writer-wins rules. A whole import can be undone later.

Import runs on the server, so it needs a connection: the Import screen disables the file picker while offline and keeps showing the last loaded job list.

## Formats

The format is detected from the content, in this order; the preview shows what was detected and the `format` option overrides it.

| Format id | Recognised by | Notes |
| --- | --- | --- |
| `opentodo` | a top-level `"format": "opentodo-export"` | Exact round trip, see below |
| `json-items` | top-level `items` and `projects` arrays | "projects / sections / items" backups |
| `json-lists` | a top-level `lists` array | lists of tasks; each list becomes a project |
| `json-generic` | a top-level array of objects, or a `tasks` array | a generic task list |
| `csv` | a header row with a `title` column | the documented columns below |

A file matching none of these is refused with `400 unsupported_format`, naming the supported formats. If a JSON export from another app is not recognised, convert it to the CSV columns below; every field the data model holds can be expressed there.

### Own export (`opentodo`)

The file from **Settings → Download export** or `GET /api/v1/export`. Labels, projects (with their sub-project tree) and tasks (with subtasks, completion and tombstones) are recreated with their original ids and field values, so importing an export into an empty account and exporting again gives an equivalent file.

When an id already exists in the account the row is skipped (`exists`), unless the `existing` option is `overwrite`: then only fields whose value differs are written (`update`), and fields that are unchanged keep their original clock, so a concurrent edit on a device is not clobbered needlessly. An entity that is deleted in the account is never resurrected (`skip`, reason `deleted`). Fields unknown to this server version are dropped with a warning.

### CSV (`csv`)

UTF-8, with a header row. Comma, semicolon and tab separators are detected from the header; quote fields that contain the separator. Header names are case-insensitive and spaces or dashes count as underscores (`Due Date` is `due_date`). Only `title` is required.

| Column | Also accepted | Value |
| --- | --- | --- |
| `title` | `task`, `content`, `summary` | required |
| `description` | `notes`, `note` | text |
| `project` | `list`, `project_name` | project name; an existing project with the same name (ignoring case) is reused, otherwise one is created |
| `section` | | becomes a label (or is ignored, by option) |
| `parent` | `parent_id` | the `id` of another row, or the title of exactly one row: the task becomes its subtask |
| `id` | `source_id` | your identifier for the row, used by `parent` and to recognise a repeated import |
| `priority` | | `1`–`4` or `p1`–`p4` (1 highest); also `high`, `medium`, `low`, `none`; blank = 4 |
| `due_date` | `due` | `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS]` (floating) or with a `Z`/offset (converted to the chosen time zone) |
| `due_time` | | `HH:MM`; requires `due_date` |
| `labels` | `tags`, `label` | comma-separated label names; missing labels are created |
| `completed_at` | | a date, date-time or Unix time (milliseconds; seconds are recognised); `true`/`yes`/`x`/`1` means "completed now" |
| `completed` | `done` | `true`/`yes`/`x`/`1` marks the task completed at import time |
| `created_at` | `created` | like `completed_at`; defaults to the import time |

Columns named `recurrence`, `repeat`, `rrule`, `reminder(s)`, `attachment(s)`, `comment(s)` or `assignee` are recognised as unsupported: a non-empty value is dropped with a warning on that row. Any other column is listed as ignored in the preview.

Rows are numbered like the file's lines (the header is row 1). A row with an invalid value is an `error` naming the row and the value, for example `row 35: invalid priority "urgent!" (expected 1-4 or p1-p4)`.

```csv
id,title,project,section,parent,priority,due_date,due_time,labels
1,Write report,Work,Q4,,p1,2026-10-20,14:30,"focus, deep"
2,Collect numbers,Work,Q4,1,2,2026-10-18,,
3,Water plants,,,,,,,home
```

### `json-generic`

A top-level array of task objects, or an object with a `tasks` array and an optional `projects` array (`{id, name, parent_id}`; `parent_id` makes sub-projects). Key names are matched leniently:

| Task attribute | Keys read |
| --- | --- |
| title | `title`, `name`, `content`, `summary`, `text` |
| description | `description`, `notes`, `note`, `body` |
| project | `project_id` (an id from `projects`), or `project` / `project_name` / `list` (a name) |
| section | `section`, `section_name`, `column`, `heading` |
| parent | `parent_id`, `parent`, or nesting under `subtasks` / `children` |
| priority | `priority`: 1–4, `p1`–`p4`, `high`/`medium`/`low`/`none` |
| due | `due`, `due_date`, `dueDate`, `deadline`: a string, or `{date, time?}` / `{datetime}` |
| labels | `labels`, `tags`: strings, `{name}` objects or a comma-separated string |
| completion | `completed`, `done`, `checked` (booleans), `status: "completed"`, and `completed_at` / `completedAt` for the time |
| created | `created_at`, `createdAt`, `created` |

### `json-items`

An object with `projects`, `sections`, `items` and optionally `labels`, `notes` and `reminders` arrays joined by ids.

| Source | Becomes |
| --- | --- |
| `projects[].name`, `parent_id` | project and sub-project; the source inbox (`inbox_project: true`) maps to the target project |
| `items[].content`, `description` | title, description |
| `items[].project_id`, `section_id` | project, section (as a label by default) |
| `items[].parent_id` | subtask |
| `items[].priority` | counted upwards in the source: 4 → 1, 3 → 2, 2 → 3, 1 → 4 |
| `items[].due.date` | due date (date-times with a zone are converted); `is_recurring: true` drops the recurrence with a warning |
| `items[].labels` | label names |
| `items[].checked`, `completed_at`, `added_at` | completion, completion time, creation time |
| `notes[]`, `reminders[]`, `deadline`, `duration` | dropped with a warning on the item |

Items and projects marked `is_deleted` are skipped.

### `json-lists`

`{"lists": [{"id", "title", "tasks": [...]}]}`; each list becomes a project with its title. Tasks read `title`, `notes` (description), `due` (RFC 3339; converted to the chosen time zone), `status: "completed"` and `completed` (completion time), `parent` (a task id) or nested `subtasks`, and `starred` / `important` (priority 1). `links` are dropped with a warning; tasks marked `deleted` are skipped.

## Mapping rules

- **Projects** are matched by name, ignoring case, against existing non-deleted projects; otherwise created. Tasks without a project go to the target project (option) or the Inbox.
- **Sections** become a label named like the section (`sections: label`, the default) or are dropped (`sections: ignore`).
- **Subtasks** are resolved after the whole file is read, so row order does not matter. A subtask joins its parent's project. A parent that is missing, invalid or would form a cycle leaves the task at the top level with a warning.
- **Labels** are matched by name, ignoring case; missing ones are created.
- **Dates**: plain dates stay dates; date-times without a zone keep their wall clock; date-times with a zone become the wall clock of that instant in the chosen time zone (default: the browser's zone in the web app, UTC through the API). Due dates are always stored floating.
- **Completion**: a completed row keeps its source completion time, or the import time when the source has none.
- **Unsupported attributes** (recurrence, reminders, attachments, comments, assignees, links) never block a row: the task is imported and the row carries a warning naming what was dropped.

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
| `sections` | `label`, `ignore` | `label` |
| `duplicates` | `skip`, `import` | `skip` |
| `errors` | `skip_rows`, `abort` | `skip_rows` |
| `existing` | `skip`, `overwrite` (own export only) | `skip` |

With `skip_rows`, bad rows are reported and everything else is imported; a bad row never leaves a partial task. With `abort`, any row in error fails the job before anything is written and names the first bad row.

## Jobs, limits and undo

- One import job per account runs at a time; starting a second one answers `409 conflict` naming the running job.
- Files may be at most `OPENTODO_IMPORT_MAX_MB` megabytes (default 20, allowed 1–200) and 50,000 rows; larger files answer `413 too_large`.
- Ops are written in batches of at most 1,000 and progress is saved after each batch. If the server restarts mid-import, the job shows `failed` with the counts of what was written, and undo removes it.
- **Undo** tombstones every project, task and label the job created, through the op log: they disappear from every view and from other devices after their next sync, and stay in the export with `deleted_at`. Entities the job only updated are left alone. As when deleting in the app, open tasks you later added to an undone project move to the Inbox, and undone labels are removed from your other tasks. Undo is idempotent. After an undo the same file can be imported again.
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
