# Proposal

## Why

Every project in OpenTodo starts empty. A household that runs the same "trip" checklist four times a year, a freelancer with a "new client onboarding" sequence, someone setting up GTD from the website's guide: all of them retype the same tasks, or import a file whose ids are fixed so it imports exactly once (`/home/user/OpenTodoWebsite/scripts/lib/template-export.mjs`: name-based UUIDs, "importing it twice skips what exists"). There is no way to duplicate a project or a task tree (the only copy code is the cross-scope move in `web/src/lib/ops.ts:582-610`, which tombstones the originals), and no way to turn a project into a file someone else can start from. Todoist, TickTick and Linear all duplicate projects and offer templates; the website already publishes ten templates in OpenTodo's own export format (`src/content/templates/*.md`, rendered by `toExport`) and can only say "download and import".

## What Changes

- **Duplicate a project.** The project menu gains "Duplicate…": a dialog with the new name (default "<name> copy"), an optional parent, and "Start on" (keep dates, or shift every due date so the earliest one lands on the chosen day). The copy holds the project's note, sub-projects, sections, open tasks with their subtasks, descriptions and notes, priorities, estimates, labels and recurrence rules, under new ids, in the same relative order. Completed tasks, occurrence records, items in the Trash, assignees, comments and reminders are not copied. The copy is a personal project of the user, even when the original is shared.
- **Duplicate a task tree.** "Duplicate" in the task panel's ⋯ menu and <kbd>Shift</kbd>+<kbd>D</kbd> on the selected task copy the task and its open subtasks right after the original, in the same project, section and parent, with the same rules as above.
- **Save a project as a template.** "Save as template…" in the project menu downloads a JSON file in the own export format (`opentodo-export`, version 1) built on the device: the project tree, its sections, open tasks and the labels they use, plus a `template` object naming the reference day for dates. No server storage: a template is a file the user owns, keeps, shares in a chat or publishes; the website is the public gallery.
- **Start a project from a template.** "From a template…" next to "New project" in the sidebar takes such a file (the website's downloads included), shows what it holds (projects, sections, tasks, labels, dated tasks), asks for a start day and an optional parent, and creates everything on the device under fresh ids, with dates shifted from the template's reference day to the start day, labels matched by name (created when missing) and recurrence kept. It works offline; the ops sync like any other.
- **One planner for all three.** Duplication and instantiation share one tree-to-operations planner in the client; "Save as template" is its inverse. Every write is one batch of ordinary operations through `mutateMany()`, applied locally first, so it works offline and converges under last-writer-wins; nothing changes on the server.
- **The Import screen keeps its meaning.** A template file dropped on Settings → Data → Import still imports once with its ids kept, as today. The import preview says so when the file carries a `template` object and points at "From a template" for a fresh copy.

Out of scope:
- Server-side templates: a gallery route, templates stored per account or per server, sharing templates between members. Files round-trip through the existing export format; a server gallery would need routes, storage, demo-list entries and sharing semantics for a feature whose first users are a website page and a household.
- Bundled templates inside the app, and fetching templates by URL from inside the app (the client would call a third-party site). The website's "Download the template" button plus "From a template" is the install path; a true one-click install (a protocol or share-target handler for files) waits for `attachments`, which brings file sharing into the PWA.
- `ot project duplicate` and an importer option that mints fresh ids. The CLI is online-only and REST-based; a script can read a template and POST its rows today. Both can follow in `cli-client` and `data-import` changes once the format is in use.
- Assistant and MCP tools that duplicate or instantiate (default no: a duplicate is up to a thousand operations, more than the write limits allow in one reviewable change set).
- Copying comments, reminders, assignees, attachments-to-be, or completed history. Templates and copies hold open work.
- Template versioning, updating projects from a changed template, or pinning templates to the sidebar.

ROADMAP: advances "Next: Parity and depth" row 7, **Project templates and duplication** (`project-templates`). Depends on: `project-notes` (a copy and a template carry the project's note; the planner copies `project.description` and `project.notes_doc` once those fields exist, and skips them until then).

Nothing here is **BREAKING**: no schema change, no route, no environment variable, no dependency. The template file is the existing export format plus one optional, additive top-level `template` key that the server importer ignores (`internal/importer/profile_opentodo.go:28-43` decodes known keys only).

## Capabilities

### New Capabilities
- `project-templates`: duplicating a project or a task tree as new entities, saving a project as a template file, starting a project from a template file, and the rules for what is copied, how dates shift and how the file is shaped.

### Modified Capabilities
- `data-import`: a new requirement says how the Import screen treats a template file (ids kept, imports once, a hint towards "From a template").

## Impact

- **Web:** a new `web/src/lib/templates.ts` (tree model, planner to `Change[]`, reader and writer of the file, date shifting, limits) used by `web/src/lib/ops.ts` helpers `duplicateProject`, `duplicateTask`; `web/src/app/ProjectHeader.tsx` menu items and a `DuplicateProjectDialog`/`SaveTemplateDialog`; `web/src/app/Sidebar.tsx` "From a template…" and a `TemplateDialog`; the task panel ⋯ menu in `web/src/app/task-detail/TaskDetail.tsx:97-98` (one `MenuItem`; rebased on `task-detail-redesign` if that lands first) and the `Shift+D` list shortcut in `TaskListView`; `web/src/lib/shortcuts.ts`; `ImportScreen.tsx` hint when the preview's file carries `template`.
- **Server:** none. The importer's preview response gains an optional `template` field echoing the file's `template.day` so the screen can show the hint (`internal/importer/profile_opentodo.go`, `Parsed`), which is the only server edit.
- **Docs:** `docs/tasks-and-projects.md` ("Duplicate a project", "Templates"), `docs/import-export.md` ("Templates" section: download from the website, From a template versus Import), `docs/import.md` (the `template` key), the keyboard guide via the shortcut table. The website's template pages can switch their wording from "import" to "From a template" and add `template.day` to `toExport` in a website change.
- **Size:** no dependency. The planner, reader, writer and two dialogs add about 4–5 KB gzipped to the web bundle; the binary grows by the embedded amount; runtime memory unchanged.
