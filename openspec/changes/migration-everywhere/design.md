# Design

## Context

- **Importer architecture.** The importer (`internal/importer`) is a list of profiles (`Profiles` in `importer.go`), each with `Detect`, `Read` into `Row`s, and a shared planner that turns rows into ops with device `import`.
- **Named formats.** They live in `profile_*.go`. Each is pinned by a real export, sanitised with `internal/importer/sanitize`, and a golden preview (`testdata/<format>/*.golden.json`).
- **ZIP handling.** `archive.go` reads ZIP uploads.
- **SQLite.** `profile_things.go` reads a SQLite file through the server's existing driver, read-only, from a private temporary copy.
- **HTML.** `profile_mstodo.go` has `htmlToText`.
- **The client.** `web/src/app/ImportScreen.tsx` holds the format menu, and `web/src/lib/types.ts` lists the format ids.
- **Switch guides.** `docs/switch/<app>.md` are user guides with front matter, compiled into `web/src/generated/help.json` for in-app help.

## Decisions

**D1. One profile per app, file-based only.** Each new format is a `Profile` with a distinctive `Detect` signature (the `data-import` rule):

| Format | Detection signature |
|---|---|
| `omnifocus-csv` | header exactly starts with `Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes` (OmniFocus 4 also writes `Tags` instead of `Context`; both accepted) |
| `vikunja-export` | a ZIP holding `VERSION` and `data.json` whose top level is an array of objects with `id`, `title`, `tasks` and `hex_color` |
| `notion-csv` | a ZIP whose CSV entries are named `<name> <32 hex>.csv` (or `<name> <32 hex>_all.csv`); a bare CSV is never detected as Notion, but can be chosen in the menu |
| `super-productivity-json` | top-level `task` and `project` objects each with `ids` (array) and `entities` (object) |
| `tududi-db` | a SQLite file with tables `tasks`, `projects`, `areas`, `tags` and a `tasks.uuid` column |

Alternative considered: importing over each app's API with a token. Rejected for 1.0: it adds outbound targets that AGENTS rule 5 would have to list, plus credential handling, for apps whose export already works.

**D2. Mapping per app.** Only what the model can hold is mapped. Anything else is dropped with a per-row warning (`data-import` "Field mapping").

*OmniFocus CSV*
- Folders become parent projects.
- `Project` rows become projects, and the `Task ID` dotted path (`3.2.1`) gives the action hierarchy as subtasks.
- Action groups become a task with subtasks.
- `Context` or `Tags`, split on `, `, become labels.
- `Start Date` becomes `start`, `Due Date` the due date (and time), `Completion Date` sets `completed_at`.
- `Duration` (`30m`, `1h30m`) becomes the estimate.
- `Flagged` becomes priority 1.
- `Notes` becomes the description.
- `Status` `Dropped` is imported as completed, with a warning "dropped in OmniFocus".
- Project type (sequential or parallel) is kept as a warning until `project-flow-modes` lands; after that it maps to the project's flow mode.
- Repeat rules are not in the CSV: a file-level note says so.

*Vikunja export*
- Projects (with `parent_project_id`) become projects and sub-projects. Archived projects are archived.
- Kanban buckets of the project's first Kanban view become sections, except the done bucket.
- Tasks: `title`, `description` (HTML to Markdown-ish text through `htmlToText`), `done`/`done_at`, `due_date`, `start_date` as start, and `end_date` dropped with a warning.
- Priority: 5 and 4 become p1, 3 becomes p2, 2 becomes p3, 0 and 1 become p4.
- `labels` become labels.
- `repeat_after` in seconds becomes "every N days" when it is a whole number of days. `repeat_mode` 1 becomes "every month"; `repeat_mode` 2 (from the done date) becomes a rule with `from completion`.
- `reminders` (absolute, or relative to due, start or end) become reminders. Relative to end is dropped with a warning.
- `related_tasks.subtask`/`parenttask` give `parent_id`, and `blocked` gives `blocked_by`.
- Attachments in the ZIP become file attachments through the existing ZIP attachment path, with ownership checks as in `import-attachment-ownership`.
- `percent_done` and `hex_color` are dropped silently, because they are display-only.

*Notion CSV* (D3 covers the columns)
- One CSV becomes one project, named after the database.
- The row's Markdown page (`<title> <id>.md` next to the CSV) becomes the description, with images and sub-page links kept as links.
- A `Sub-item`/`Parent item` relation gives subtasks.

*Super Productivity JSON*
- `project.entities` become projects.
- `tag.entities` become labels, except the built-in `TODAY` tag. A task tagged `TODAY` is scheduled today, with a warning that it was imported on the import date.
- `task.entities` and `archivedTasks`: `title`, `notes`, `isDone`/`doneOn`, `subTaskIds`/`parentId`.
- `dueDay` or `dueWithTime` becomes the due date and time, in the preview's time zone.
- `timeEstimate` in milliseconds becomes the estimate in minutes, rounded up.
- `timeSpentOnDay` (`{"2026-10-01": 1800000}`) becomes one time entry per day, starting at 09:00 floating on that day, with the day's duration (D4).
- `taskRepeatCfg.entities` become a recurrence rule: `repeatCycle` DAILY, WEEKLY with weekday booleans, MONTHLY or YEARLY, with `repeatEvery`.
- Issue links (`issueType`, `issueId`) become a URL origin when `issueLink` is an http(s) URL; otherwise they are dropped with a warning.

*Tududi database*
- `areas` become parent projects, `projects` projects, `tasks` tasks.
- `parent_task_id` gives subtasks.
- `tags` become labels through its join table.
- Priority `high`/`medium`/`low` becomes p1/p2/p3; none becomes p4.
- `due_date` becomes the due date. Status `done` or `archived` becomes completed, and `in_progress` stays open.
- `recurrence_type`/`recurrence_interval` become a rule where the grammar can express it.
- `note` becomes the description. `notes` rows linked to a project are appended to the project notes.
- `today` flag tasks are scheduled today, with a warning.
- The database is read read-only from a private temporary copy, like Things.
- Column names are checked at detection. An unknown schema version is refused with a message naming the Tududi versions tested.

Every row gets `origin {kind:"import", provider:"<app>", id}` with the source id, so re-importing skips rows already imported (`data-import` "Duplicate detection").

**D3. Notion column mapping is a preview option, with guesses shown.**
- Notion's first CSV column is always the title property. The other columns are guessed by name (case-insensitive, in the six app languages) and by values:

| Role | Name guesses | Value check |
|---|---|---|
| status | Status, Done, Completed, Erledigt, Fait, Fatto, Hecho, Feito | values `Done`, `Complete`, `Completed`, `Yes` (checkbox) mean completed |
| due | Due, Date, Deadline, Fällig, Échéance, Scadenza, Vencimiento, Prazo | Notion date strings (`October 29, 2026`, `October 29, 2026 3:00 PM`, ranges `A → B` take B as due and A as start) |
| labels | Tags, Labels, Etiketten, Étiquettes, Etichette, Etiquetas | comma-separated |
| priority | Priority, Priorität, Priorité, Priorità, Prioridad, Prioridade | `High`/`Urgent`/`P1` give 1, `Medium`/`P2` give 2, `Low`/`P3` give 3 |
| project | Project, Projekt, Projet, Progetto, Proyecto, Projeto | relation values `Name (https://www.notion.so/…)` take the name |
| notes | Notes, Description, Beschreibung, … | text |

- The preview response carries `columns: {role: columnName|null}`. The client shows one select per role, listing the CSV's columns and "Not imported", and re-runs the preview when a choice changes.
- `POST /api/v1/import` accepts the same `columns`. An unknown column name is a 400 `invalid_input`.
- Columns mapped to no role are dropped. One file-level note names them; there is no warning per row.
- Alternative: create a custom field for every unmapped column. Rejected as a default: Notion databases often carry a dozen formula and rollup columns, which would clutter the project. A later change can offer it as an option.

**D4. Time entries from Super Productivity.**
- `Row` gains `TimeEntries []TimeEntry{Day string, Minutes int}` (importer-internal, additive).
- The planner writes them as `time_entry` ops: start at 09:00 floating on that day, end after the minutes, `source: "import"`.
- They go through the same validation as the time-entry routes (`internal/timetrack`).
- A day with more than 24 hours is capped at 24 hours with a warning.
- Alternative: drop tracked time. Rejected: tracked time is the reason many people use Super Productivity.

**D5. The picker is client-side and reuses the switch guides.**
- `ImportScreen.tsx` gains, above the file picker, a Combobox **Switching from…** with the 15 apps, each with its icon from the catalogue (no brand logos; a generic icon per kind).
- Choosing an app does three things:
  1. It sets the format override to that app's format id. Detection still runs and warns if the file looks like another format.
  2. It shows the "Export from <app>" section of `docs/switch/<app>.md` inline, from `help.json`. That section is marked in each guide with a fixed heading id `#export`.
  3. It shows a "Full guide" link.
- With no choice, the screen behaves as today.
- The picker is hidden while offline, like the file picker.
- Alternative: a separate wizard screen. Rejected: one more screen, and the Import screen already has the steps.

**D6. The matrix and its check.**
- `docs/switch/README.md` has one row per app. The columns are App, Format id, What comes with you, What stays behind, and Last verified (a date and the app version).
- `scripts/repo-checks.test.mjs` gains a check that the row's app list equals a fixed list of the 14 competitors in the 1.0 roadmap plus Linear. For each row it requires:
  - a format id present in `internal/importer` (read from the Go source's format constants);
  - a guide `docs/switch/<app>.md` with an `#export` heading;
  - a non-empty `internal/importer/testdata/<format>/` with at least one `*.golden.json`;
  - a last-verified date.
- Before the 1.0 tag, each date must be within the 120 days before the release date in `CHANGELOG.md`. A stale date fails only the release check, run by `make release-prepare`, not every pull request.

**D7. Fixtures from real accounts.**
- Every new format needs one small export and one "rich" export from a real account, sanitised with `internal/importer/sanitize`, which gains a mode per format.
- Super Productivity and Vikunja can be run locally (both are open source), and Tududi too.
- OmniFocus needs a Mac with a trial licence. Notion needs a free account.
- The goldens are generated by the existing `-update` flag of the profile tests.

## Progressive disclosure and interface budget

- **Where it lives.** The picker is one row in Settings → Data → Import data, above the file picker. Simple-list users see it only when they open the Import screen.
- **Interface budget.**
  - No new sidebar destination.
  - No new shortcut: the existing `g` `Shift+I` opens the screen.
  - One extra row of controls in a settings screen, which is not a task list, so the chrome budget for lists does not apply.
  - The Notion mapping selects appear inside the preview card only for `notion-csv`.
- **Phone layout.** The Combobox is full width. The steps are collapsed behind a "Show steps" toggle under 640 px wide.

## Data model

None. The entities are the existing projects, sections, tasks, labels, reminders, attachments, time entries and project notes. Ops are additive, with device `import`.

## Size

Five profiles add about 60 KB to the binary, with no new dependency: the SQLite driver, the ZIP reader and the HTML stripper are already in. The web bundle grows by about 3 KB gzip, lazy with the Import screen. Memory: files stay under the existing 20 MB and 50,000-row limits, and ZIP entries are streamed as today.
