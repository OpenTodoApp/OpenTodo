# Design

## Context

- **Formats today.** `internal/importer` reads every format through the `Profile` interface (`Name`, `Description`, `Detect(data)`, `Read(r, opts)`). The ordered `Profiles` slice is `opentodo`, `json-items`, `json-lists`, `json-generic`, `csv`. Detection takes the first profile whose `Detect` accepts the bytes.
- **What profiles produce.** Normalised `Row`s (kind, source id, parent reference, project and section names, labels, priority, due, recurrence string, reminders, description, completion, warnings). Planning, duplicates, sections, recurrence, reminders, the op-writing job and undo are shared.
- **Upload.** `internal/httpapi/import.go` reads the whole body up to `ImportMaxBytes` (default 20 MB) before parsing. Row cap: 50,000.
- **Dates on the server.** `parseDue` (`values.go`) understands structured dates and date-times only. The natural-language parser with six language vocabularies (`en`, `de`, `es`, `fr`, `it`, `pt`) lives in the web app (`web/src/lib/nlp/`).
- **List or board.** A project's list or board mode is a per-device setting (`getMeta(modeKey(projectId))` in `web/src/lib/sections.ts`), not synced data.
- **Real exports examined** (maintainer's files, structure only, October 2026):
  - **Todoist backup.** A ZIP of 10 CSVs, file names `<Project> [<id>].csv`, UTF-8 with BOM. Header (19 columns): `TYPE, CONTENT, DESCRIPTION, IS_COLLAPSED, PRIORITY, INDENT, AUTHOR, RESPONSIBLE, DATE, DATE_LANG, TIMEZONE, DURATION, DURATION_UNIT, DEADLINE, DEADLINE_LANG, REMINDER_TYPE, REMINDER_OFFSET, REMINDER_DATE, REMINDER_DATE_LANG`.
    - Each file starts with a `meta` row (`view_style=list|board`). Blank rows separate blocks. Rows are `section` and `task`, with `INDENT` 1 to 2.
    - `PRIORITY` values seen: 4, 3, 2.
    - `AUTHOR` and `RESPONSIBLE` are `Name (userid)`.
    - `DATE` is a localised display string without a year (`21 Okt.`, `3 Sept.` with `DATE_LANG=de`; `3 Apr` with `en`). `TIMEZONE` is an IANA zone.
    - The backup's file name carries the export time (`Todoist_backup_2026-09-19_2210_UTC.zip`).
  - **Things database.** `main.sqlite`, schema `databaseVersion` 29 (a plist in `Meta`), WAL journal.
    - `TMTask` holds to-dos, projects and headings (`type` 0, 1, 2), plus `status`, `trashed`, `start` (0 inbox, 1 anytime, 2 someday), `startBucket` (evening), `startDate` and `deadline` as packed integers (`year<<16 | month<<12 | day<<7`; 132819584 = 2026-10-21), `reminderTime`, `rt1_recurrenceRule` (plist), and `area`, `project` and `heading` references.
    - Also `TMArea`, `TMTag` (with `parent`), `TMTaskTag`, `TMChecklistItem` (with `status`).
    - Creation and stop dates are Unix seconds as floats.
  - **TickTick backup.** One CSV, UTF-8 with BOM. A preamble of three quoted values spans six physical lines: `Date: 2026-10-14+0000`, `Version: 7.2`, and a status legend (`0 Normal`, `-1 Abandoned`, `2 Completed`). Then a 25-column header:
    `Folder Name, List Name, Title, Kind, Tags, Content, Is Check list, Start Date, Due Date, Reminder, Repeat, Priority, Status, Created Time, Completed Time, Order, Timezone, Is All Day, Is Floating, Column Name, Column Order, View Mode, taskId, parentId, projectKind`
    - `Kind` seen: `TEXT`. `Priority` seen: 0. `View Mode` is per list (`list` seen; `kanban` expected for boards).
    - `Created Time` looks like `2026-10-14T08:00:00+0000`. `Timezone` is IANA. `Is Floating` is `false`/`true`. `parentId` references `taskId`.
  - **Linear CSV.** 34 columns:
    `ID, Team, Title, Description, Status, Estimate, Priority, Project ID, Project, Creator, Assignee, Labels, Cycle Number, Cycle Name, Cycle Start, Cycle End, Created, Updated, Started, Triaged, Completed, Canceled, Archived, Due Date, Parent issue, Initiatives, Project Milestone ID, Project Milestone, SLA Status, UUID, Time in status (minutes), Related to, Blocked by, Duplicate of`
    - `ID` looks like `PIX-5`. `Status` holds workspace names (`Backlog`, `In Progress`, `Done`). `Priority` is text (`No priority`, `High`, …).
    - `Labels` are comma-separated. `Creator` and `Assignee` are email addresses. Timestamps are ISO UTC with milliseconds.
    - Doubled quotes escape quotes, and there's a trailing blank line.
- **Specs:** `specs/data-import/spec.md` and `specs/documentation/spec.md` in this change.

## Goals / Non-Goals

**Goals:**
- A real export from each app imports with zero manual conversion and a preview that explains every dropped attribute.
- Detection never misfires: a file is assigned to a named format only on that format's distinctive signature.

**Non-Goals:**
- Every historical export variant. We support the current one, verified by fixtures. Older variants arrive as user-reported fixtures.
- Syncing a project's list/board mode across devices (a separate change could make it a `project_prefs` field).

## Decisions

### D1. One profile per named format, ahead of the generic ones
New profiles: `thingsDB`, `todoistCSV`, `tickTickCSV`, `linearCSV`. `Profiles` becomes: `opentodo`, `things-db`, `json-items`, `json-lists`, `json-generic`, `todoist-csv`, `ticktick-csv`, `linear-csv`, `csv`.

| Format | Signature |
| --- | --- |
| `things-db` | SQLite header magic, then (after the safe open of D4) tables `TMTask`, `TMArea`, `TMChecklistItem` and `Meta` with a `databaseVersion` |
| `todoist-csv` | BOM-tolerant header equal to (or starting with) the 19 Todoist columns, `TYPE` first |
| `ticktick-csv` | A CSV whose first record starts with `Date:` and whose header (found after the preamble records) starts with `Folder Name, List Name, Title, Kind` |
| `linear-csv` | Header with `ID`, `Team`, `Title`, `Status`, `Priority` and `UUID`, and `ID` values matching `^[A-Z][A-Z0-9]*-\d+$` |

### D2. ZIP as a container, not a format
When the upload starts with `PK\x03\x04`, entries are listed in memory with `archive/zip`:
- **Limits:** 1,000 entries, and an uncompressed total of 10 × `ImportMaxBytes`, enforced while reading.
- **Skipped entries:** folders, `__MACOSX/` and dot-files.
- **Uniform format:** all remaining entries must detect as one profile.

Two shapes are recognised:
- **CSVs of one profile.** A Todoist backup becomes `todoist-backup`. The project name comes from the entry name without the ` [<id>].csv` suffix, and line numbers are prefixed with the entry name.
- **A zipped `Things Database.thingsdatabase` folder.** Its single `main.sqlite` is handed to `things-db`, and the `-wal` file, when present, is applied by opening both in a temporary directory (D4).

### D3. Mapping notes per app
- **Todoist.**
  - The BOM is stripped. The `meta` row records the project's `view_style`, and blank rows are skipped.
  - An indent stack builds subtasks.
  - `PRIORITY` uses the numbers the app shows (1 = the red flag, 4 = no priority), unlike Todoist's API where 4 is the highest. The maintainer's backup settles it: 29 of 32 tasks carry 4, which can only be the default. It maps directly (1 = p1 … 4 = p4). A richer sample with a known red-flag task will pin it further.
  - `@label` tokens in `CONTENT` become labels.
  - `DATE` goes through D7, with `TIMEZONE` for timed values.
  - `DEADLINE` maps to the task's deadline through the same date-language parser as `DATE` (with `DEADLINE_LANG`, else `DATE_LANG`); an unreadable value is kept as a description line with a warning (changed by `deadlines`, design D9). `DURATION` with unit minute maps to `estimate_minutes`.
  - `REMINDER_*` become reminders where expressible.
  - `RESPONSIBLE` is dropped with a warning unless it's the importer. `AUTHOR` is ignored.
  - Note rows are appended to the description under "Comments".
- **TickTick.**
  - The preamble records are read as CSV (they're quoted multi-line values), so the header is found by record, not by line. `Date:` gives the export date and `Version:` is recorded in the preview.
  - Folders become parent projects, lists become projects, and `Column Name` becomes the section.
  - `parentId` builds subtasks. `Kind = CHECKLIST` rows turn their content lines into subtasks.
  - `Tags` become labels and `Content` becomes the description.
  - Priority 5/3/1/0 maps to p1, p2, p3, p4.
  - `Due Date` (with `Is All Day`, `Is Floating` and `Timezone`) becomes a floating due date. `Reminder` becomes reminders where expressible, and `Repeat` RRULEs go through the existing conversion.
  - `Status` 2 is completed with `Completed Time`. `-1` (abandoned) is completed with the label `canceled`.
- **Linear.**
  - The project comes from `Project`, else `Team`. `Status` becomes the section in first-seen order.
  - `Completed` / `Canceled` timestamps decide completion, and canceled issues get the label `canceled`.
  - Priority text maps to p1 to p4. `Labels` are split on `, `. `Due Date` is a plain date. `Parent issue` is resolved by identifier.
  - The description is prefixed with `ID`.
  - `Assignee` equal to the importing user's email keeps the assignment.
  - Estimates, cycles, milestones, initiatives, SLA and relations (`Related to`, `Blocked by`, `Duplicate of`) produce a warning.

### D4. Things database, opened safely
The uploaded bytes (already bounded by `ImportMaxBytes`) are written to a fresh temporary directory under the data directory, as `main.sqlite` plus `main.sqlite-wal` when it came from a ZIP. The database is opened with the bundled driver, read-only and immutable when there's no WAL (`mode=ro&immutable=1`). With a WAL, it's opened read-only on the private copy. Then `PRAGMA query_only=1` and a statement timeout are applied, and nothing beyond the known Things tables is read, with fixed queries only.

The `databaseVersion` plist is parsed. Version 29 is supported, and other versions are accepted with a warning while the queries still succeed, or refused with the version named. The directory is removed when the preview or job finishes, including on errors.

Mapping:
- `TMArea` → parent projects.
- `TMTask type=1` → projects (inside their area), `type=2` → sections of their project, `type=0` → tasks in their project or heading's project, else the area, else the Inbox.
- `TMChecklistItem` → subtasks.
- `TMTag` (parents flattened as `parent/child`) → labels via `TMTaskTag`.
- `notes` → the description. Newer XML-wrapped notes are unwrapped to text.
- `status` 3 (completed) or 2 (canceled) → completed with `stopDate`, and canceled ones get the label `canceled`.
- `trashed` → skipped.
- Packed `startDate` → due date, with `reminderTime` → a reminder when present. `rt1_recurrenceRule` (a plist of frequency, interval and weekdays) → the recurrence grammar where expressible.
- `deadline` → the task's deadline (changed by `deadlines`, design D9).
- `start=2` (someday) → the task's start `someday`, and `startBucket=1` (evening) → its evening flag (changed by `someday-and-evening`, design D9).

Alternative considered: an Apple Shortcut writing a published JSON shape. Rejected now that the database can be copied directly. It needed a Shortcut per user, and it lost fields the database has.

### D5. Fixtures from real exports, sanitised
`internal/importer/sanitize` (a `go run` tool that nothing imports, so it is never in the binary; its tests run with `go test ./...`) replaces titles, notes, project, area, tag and label names, people's names, user ids and email addresses with deterministic placeholders. It keeps structure, dates, priorities, recurrence, indent, statuses, column order, the meta and BOM, and for SQLite rewrites text columns in a copy, then runs `VACUUM`. Fixtures live in `testdata/<format>/` with golden previews (`*.golden.json`), and `-update` regenerates them. The maintainer reviews every sanitised fixture before commit.

### D6. Switch guides
Each `docs/switch/<app>.md` has four parts:
1. Export: Todoist backups, the Things database copy with Things closed (and the iPhone/iPad route via the diagnostics code, unpacked on the device), and the Linear workspace CSV.
2. Import.
3. What carries over (anchored to the mapping tables in `docs/import.md`).
4. What doesn't.

Screenshots of the preview come from fixtures.

### D7. Todoist dates on the server
A narrow Go parser (`internal/importer/todoistdate.go`) reads the forms Todoist writes into `DATE`:
- day and abbreviated month (`21 Okt.`, `Oct 21`), optionally with a year and a time (`21 Okt. 2027 15:00`, `Oct 21 3:00 PM`)
- relative words Todoist may export (`today`, `tomorrow` and their translations)
- recurring phrases (`every monday`, `jeden Montag`, …), which go to the recurrence grammar after translation to its English canonical form

Month, weekday and keyword vocabularies for the six languages are extracted from `web/src/lib/nlp/vocab/*.ts` into a shared JSON vector file. A test in each language checks that Go and TypeScript agree, following the `activity` and `recurrence` shared-fixture pattern.

**Year inference:** the reference date is the export date from the backup's file name, else the import date. Todoist writes a year when the date isn't in the current year, so a date without a year takes the reference year. An unknown phrase keeps the task, leaves the due date empty and adds a warning quoting the original string.

### D8. Board hints applied on the importing device
The job result gains `viewHints: [{projectId, view: "board"}]` for Todoist projects with `view_style=board`, TickTick lists with `View Mode` `kanban`, and Linear projects (statuses become sections). After a commit, the web import screen sets those projects to board in the device's settings. API and CLI imports return the hints and don't act on them. Nothing is synced, and other devices keep their choice.

## Risks / Trade-offs

- **[Apps change their export format]** → Fixtures pin today's format, and user reports become fixtures plus detection tweaks. The preview always states what was recognised.
- **[Inverted Todoist priority]** → Confirmed by a fixture with a known UI flag before release (D3).
- **[A malicious SQLite upload]** → A private temp copy, read-only and query-only connection, fixed queries over known tables, size bounded by the upload limit, and deletion afterwards. SQLite is designed to handle untrusted database files in read-only use, and we add a timeout.
- **[Things open while copying]** → A stale or locked copy. The guide says to quit Things first (as Cultured Code's article does), and a ZIP of the folder carries the WAL.
- **[Todoist date phrases we don't recognise]** → The task is kept with a warning quoting the phrase, and a new fixture fixes it.
- **[Personal data in fixtures]** → The sanitiser (D5) plus maintainer review.
- **[Size]** → No new dependency: `archive/zip`, `encoding/csv` and the already-bundled SQLite driver, plus a small vocabulary file. No effect on image size or runtime memory beyond the existing upload bound.

## Migration Plan

Additive: new format values and a new optional job-result field. Rollback is a revert. Jobs created with a new format keep working for undo, because undo uses recorded entity ids.

## Open Questions

- The richer samples (recurrence, reminders, deadlines, completed and abandoned items, checklists, p1) may add cases to D3, D4 and D7 without changing the approach.
