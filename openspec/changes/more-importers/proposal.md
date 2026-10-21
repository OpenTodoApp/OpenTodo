# Proposal

## Why

The importer recognises four apps' files (Todoist, Things, TickTick, Linear) and the generic shapes; everyone else has to convert their data to the CSV columns by hand. The six apps the roadmap set aside (Microsoft To Do, Google Tasks, Apple Reminders, Trello, Asana, Any.do) hold most of the remaining people who want to switch, and since `named-importers` shipped, the framework they need exists: profiles that read a file into normalised rows, the shared planner with duplicates and undo, sanitised fixtures with golden previews, origins (`task-origin`), custom fields (`custom-fields`), deadlines, start dates and dependencies. Each importer is now a profile plus a fixture plus a switch guide. The one thing `named-importers` left open, Linear estimates dropped with a warning, closes at the same time: they become a number field.

## What Changes

- **Six named formats**, detected from the file content like the existing ones, each verified against a sanitised real export kept with the tests:
  - `google-tasks-json`: the `Tasks.json` file of a Google Takeout export (lists with their items, nested subtasks by `parent`, `due`, `notes`, `status`, `completed`).
  - `trello-json`: a board's JSON export (menu → Print and export → Export as JSON): lists become sections of one project per board, cards tasks, checklists subtasks, labels labels, due dates, members, comments appended under a heading, attachments as link attachments, archived cards completed.
  - `asana-csv`: a project's CSV export (project menu → Export → CSV): sections, subtasks by `Parent task`, assignee, due and start dates, tags as labels, custom field columns as custom fields (number, text, choice), completed rows.
  - `microsoft-todo-json`: Microsoft To Do has no export. The profile reads the Microsoft Graph To Do shape (`todoTaskList` objects with their `todoTask` items, `linkedResources`, `checklistItems`, `recurrence`, `reminderDateTime`, `dueDateTime` with a time zone, `importance`, `status`, `body`), as written by the documented PowerShell or Graph Explorer script in the switch guide, and the Outlook/Microsoft privacy export's `Tasks` JSON when it has the same objects.
  - `apple-reminders-json`: Apple Reminders has no export either. The profile reads the JSON the switch guide's Shortcuts recipe writes (one object per reminder: `list`, `title`, `notes`, `dueDate`, `isCompleted`, `completionDate`, `priority`, `flagged`, `tags`, `url`, `parent`, `subtasks`). The guide also says that an existing CalDAV connection moves the same data without a file.
  - `anydo-json`: Any.do has no export. The profile reads the JSON of Any.do's account data request (GDPR / "Download my data"), the only file a user can obtain, with lists (`categories`), tasks, subtasks, notes, due dates, repeat rules, priority, tags and status, and says in the guide what it cannot verify.
- **Linear estimates become a number field.** The `Estimate` column creates (or reuses by name and type) a number field "Estimate" on the imported project and writes the points as that field's value, instead of the current warning. The same mechanism carries Asana's number, text and single-select custom fields and Trello's custom fields when present.
- **The import screen, the format list and the site bundle manifest** list the six new formats; detection order and distinctive signatures keep every existing fixture detecting as before.
- **Switch guides** `docs/switch/microsoft-todo.md`, `google-tasks.md`, `apple-reminders.md`, `trello.md`, `asana.md`, `anydo.md`, each with how to obtain the file (including the script or Shortcut where the app has no export), the import steps, what carries over and what is dropped, plus the mapping tables in `docs/import.md`.
- **Origins and duplicates.** Each imported task carries `{kind: "import", provider: <profile>, id: <source id>}` with the app's own id, and that id keys duplicate detection, like Todoist, Things and TickTick today.
- No new environment variable, no new dependency, no op-log change (custom field values are written with the existing `fields` map and `field` entity).

Out of scope: writing back to any of these apps; a Trello Power-Up, an Asana app, Microsoft Graph or Google Tasks API connections that pull live (a later change can turn `issue-import`'s poller into a generic "follow a list" job); Trello boards as dashboards, board power-up data, card cover images and file attachments (links only, as for every importer); Asana portfolios, goals, approvals, multi-select fields and custom field formulas; Microsoft To Do's "My Day" (it is a daily view, not data; it is dropped silently), its shared-list members and attachments (file bytes are not in the export); Apple Reminders' location and messaging triggers and Smart Lists; Any.do's shared lists, moments and attachments; an `ot import` command (the CLI has no import today; it stays a web and REST feature); older or future variants of a format that a fixture does not show; website comparison pages (they live in `pixari/OpenTodoWebsite` and read the formats from the bundle manifest, so they gain the six "Switch from" pages without a change here).

Advances ROADMAP.md "Capture and input" (JSON / CSV import, including export files from popular commercial task apps) and closes the "importers for Microsoft To Do, Google Tasks, Apple Reminders, Trello, Asana and Any.do" entry of the set-aside list; closes the Linear estimates note on `named-importers`.

## Capabilities

### New Capabilities

None. Every behaviour is an import format, which the `data-import` capability already defines per app.

### Modified Capabilities
- `data-import`: "Accepted import formats" lists the six new formats; "Named formats are verified against real exports" names the formats whose fixture comes from a scripted export rather than a built-in export; "Linear attributes" maps estimates to a number field instead of dropping them; "Imported origins" covers the new profiles; new requirements "Imported custom fields", "Google Tasks structure", "Google Tasks attributes and dates", "Trello structure", "Trello attributes and dates", "Asana structure", "Asana attributes and dates", "Microsoft To Do structure", "Microsoft To Do attributes and dates", "Apple Reminders file", "Apple Reminders attributes and dates", "Any.do file", "Any.do attributes and dates".
- `documentation`: the user guide covers switching from the six apps, each guide including how to obtain the file where the app has no export.
- `site-bundle`: no requirement change (the manifest already lists every format the binary prints); listed here only to say the website gains the formats without a change. No delta file.

## Impact

- `internal/importer`: six new profile files (`profile_google.go`, `profile_trello.go`, `profile_asana.go`, `profile_mstodo.go`, `profile_apple.go`, `profile_anydo.go`), `Row` gains `Fields` (named typed values) and the foreign planner learns to create or reuse field definitions per project; `Profiles` order and detection tests; `profile_linear.go` loses the estimate warning; `sanitize` learns the new JSON shapes; `testdata/<format>/` gains a sanitised real file and a synthesised rich file per format with golden previews.
- `internal/httpapi`: nothing new (the preview and job routes are format-agnostic); `--print-formats` lists the new names, so the site bundle manifest and the website's "Switch from" pages follow.
- `web/src/lib/types.ts` `ImportFormat` and `IMPORT_FORMATS`; `web/src/app/ImportScreen.tsx` labels and the five translation catalogs.
- `docs/import.md` mapping tables, six `docs/switch/*.md` guides with import screenshots (`make docs-screenshots`), `docs/README.md` index, `README.md` feature line, CHANGELOG.
- Binary: six profiles of plain Go on the standard library, about 60–90 KB; no dependency; no web bundle change beyond six labels.
