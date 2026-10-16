# Proposal

## Why

The website will promise "switch from Todoist, Things, TickTick or Linear in 2 minutes", but the importer only recognises generic shapes (`json-items`, `json-lists`, `json-generic`, and CSV with a `title` column). None of those matches the files these apps actually produce:
- Todoist's project CSV uses `TYPE`, `CONTENT` and `INDENT` columns, and its backup is a ZIP of such CSVs.
- TickTick's CSV backup starts with a multi-line preamble before its header.
- Linear's CSV has its own columns and statuses.
- Things has no export at all, but its database (`main.sqlite`) can be copied as Cultured Code's support article describes.
- Todoist writes dates as localised display strings without a year (`21 Okt.`), which the server cannot read today: the multi-language date parser exists only in the web app.

A switcher who hits `unsupported_format` at step one leaves. This change makes each app's real export import as-is, verified against real export files.

## What Changes

- **Named formats, detected from content.** `todoist-csv`, `todoist-backup` (the ZIP of project CSVs), `ticktick-csv`, `linear-csv` and `things-db`. Each is recognised from the file itself, shown in the preview and overridable, like today's formats.
- **ZIP archives.** A ZIP whose entries are files of one supported format is imported as one job, with limits on entry count and uncompressed size so a crafted archive cannot exhaust the server.
- **Faithful mapping per app.** Projects, sections or headings, subtasks and checklists, labels and tags, priorities on each app's scale, due dates with times, recurrence written in the app's own syntax, notes and completion.
  - Linear workflow statuses become sections, so a board looks the same.
  - What OpenTodo cannot hold is dropped with a per-row warning, as today: Things deadlines, Someday and This Evening, Linear estimates, cycles, milestones and relations, assignees who are not the importing user (a Linear issue assigned to the importer's own email stays assigned), attachments, and comments where the format cannot attribute them.
- **Things straight from its database.** `things-db` reads a copied `main.sqlite` (or a ZIP of the `.thingsdatabase` folder) read-only, so switching from Things needs no Shortcut or third-party tool.
- **Todoist dates on the server.** A small server-side parser for Todoist's date strings in the six quick-add languages, sharing its vocabulary with the web app's parser through test vectors, with the year taken from the export date.
- **Board projects stay boards.** Projects that were boards in Todoist (or have workflow statuses in Linear) open as boards on the device that imports them.
- **Switch guides.** `docs/switch/todoist.md`, `things.md`, `ticktick.md` and `linear.md`, each walking through export, import, what carries over and what is dropped. They appear on the docs site and in the in-app Help, and the website links to them.
- **Real fixtures.** Each format is tested against export files made from real accounts of each app, stripped of personal data, and kept in the repository as test fixtures.

## Out of scope

- Importing directly from the apps' APIs with the user's credentials. It would mean outbound requests to third parties, and files are enough.
- Comments with their original authors, and attachments (no attachment support yet).
- New data-model fields. Deadlines and Someday are dropped with warnings until the `deadlines` and `someday-and-evening` changes add them. The importer then maps them in those changes.
- Website pages. They live in the website repository (`pixari/OpenTodoWebsite`, change `website-switcher-pages`), which links to the switch guides and reads the released formats from the site bundle (`site-bundle`).

Advances ROADMAP.md "Capture and input" (import from popular commercial task apps), and is the prerequisite for the website's switch promise.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-import`: "Accepted import formats" gains the named app formats and ZIP archives. New requirements cover each app's mapping, archive limits and the documented Things export shape.
- `documentation`: "User guide" adds switch guides for Todoist, Things, TickTick and Linear.

## Impact

- **Code:** `internal/importer`, with new profiles beside `profile_opentodo.go` and the generic ones, ZIP reading with the standard library `archive/zip`, read-only reading of an uploaded Things database through the SQLite driver the server already bundles, a Todoist date parser with shared vocabulary vectors from `web/src/lib/nlp/vocab`, and format detection order. The import screen applies board hints from the job result on the importing device. `docs/import.md` gains the formats and their mapping tables, and `docs/switch/*.md` are new. Fixtures go under `internal/importer/testdata/`.
- **API:** no new route. `format` gains new values, and `400 unsupported_format` lists them.
- **Data, sync:** none. Rows still become ops through the existing import job, with undo.
- **Size:** no dependency (`archive/zip` and `encoding/csv` are in the standard library). Binary growth is negligible.
- **Input:** the maintainer has provided a Todoist backup, a Things database, a Linear CSV and a TickTick backup (their structure is recorded in design.md). Still wanted: richer samples covering recurrence, reminders, deadlines, completed items, checklists and p1.
