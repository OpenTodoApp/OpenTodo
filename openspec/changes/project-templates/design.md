# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Copying exists only as a move.** `copyTasks` in `web/src/lib/ops.ts:589-610` copies a task list under new ids with `COPY_FIELDS` (title, description, notes_doc, priority, due, labels, estimate, recurrence, series_id, assignee, completion, position, created_at), remaps `parent_id` between copied tasks, drops `section_id`, and its callers tombstone the originals (`moveTaskAcrossScopes`, `deleteProject`, `restoreTask`). Projects have `createProject` with `lastAmongProjectSiblings` (`ops.ts:443-470`); sections are created in `lib/sections.ts`; placement within a list goes through `lib/ordering` (`planMove`, `Placement`) as `lib/move.ts` does.
- **Batches.** `mutateMany(changes)` writes one batch with one timestamp, applies locally and queues the outbox (`ops.ts:269`); the sync loop uploads 500 ops per request (`lib/sync.ts:20`) against the server's 1,000-op request cap. Nothing caps a batch on the device today.
- **The template format already exists.** The website's `toExport` (`/home/user/OpenTodoWebsite/scripts/lib/template-export.mjs`) writes `{format: "opentodo-export", version: 1, exportedAt, labels, projects, sections, tasks, reminders: [], views: []}` with name-based UUIDs and due dates resolved from offsets against the build day (`exportedAt`). The server's own-export profile decodes known top-level keys only (`internal/importer/profile_opentodo.go:28-43`), so an extra key is ignored, and `planOwn` skips existing ids with reason `exists` (`plan.go:29`).
- **Labels** are matched by name ignoring case in `lib/labels.ts` (`findLabelByName`, `createLabel` refuses a duplicate name).
- **Roles.** `canEditTasks(role)` and `canEditProject(role)` in `lib/sharing.ts`; a new project is always created in the user's personal scope (`createProject` writes no membership; sharing is a server-side act).
- **Recurring tasks.** A series is the task with a `recurrence` rule; occurrence records carry `series_id` and `completed_at` (`docs/sync.md` "Recurrence"). Copying a series' rule and due date makes a new, independent series.
- **Menus and dialogs.** `ProjectHeader.tsx` builds the project menu on `app/overlay` `Menu`; the task panel's ⋯ menu is a `Menu` with `MenuItem`s (`task-detail/TaskDetail.tsx:97`); dialogs such as `ShareDialog` use the overlay primitives and render as a sheet on phones.

## Goals / Non-Goals

**Goals:**
- One client-side planner that turns a tree (from Dexie or from a file) into one `mutateMany` batch: duplicate project, duplicate task tree, instantiate template. One writer that turns a Dexie tree into the file: save as template.
- Offline, convergent, no server change beyond a preview hint.
- The website's existing downloads work as templates unchanged.

**Non-Goals:**
- Server-side templates, bundled templates, fetching by URL, CLI and agent duplication, copying comments, reminders or assignees (see proposal, out of scope).
- Changing the export format. The `template` key is additive and optional.

## Decisions

### D1. The template file is an own export plus an optional `template` object

A template is `opentodo-export` version 1 (the format the website emits and the importer reads) with one more top-level key:

```
"template": { "day": "YYYY-MM-DD" }
```

`day` is the reference day for date shifting. When it is absent (every website file today), the reference day is the UTC calendar date of `exportedAt`, which is exactly how `toExport` resolves `+0d`. The file holds `labels`, `projects`, `sections` and `tasks`; `reminders`, `views`, `comments` and `user_prefs` are written empty by "Save as template" and ignored when reading. Entity fields are the sync schema's; ids inside the file are only references between its own rows.

- **Alternative: a new `opentodo-template` format with relative offsets (`+3d`) like the website's front matter.** Rejected. It would need a second reader on the server (the importer must accept templates too, per the Import screen rule), a second writer on the website, and the roadmap asks for "plain JSON in the existing import format". Absolute dates plus a reference day express the same offsets.
- **Alternative: reuse the file but strip ids.** Rejected. The importer requires ids (`profile_opentodo.go:63` fails a row without one), and the website's deterministic ids are what make its downloads import exactly once, a behaviour the templates page promises.

### D2. One tree model and one planner, in `web/src/lib/templates.ts`

```
interface TemplateTree { labels: {name, color?}[]; projects: TProject[] }
TProject  { name, color, description?, notes_doc?, sections: {name, tasks: TTask[]}[], tasks: TTask[], children: TProject[] }
TTask     { title, description, notes_doc?, priority, due, labels: string[] (names), estimate_minutes, recurrence, subtasks: TTask[] }
```

- `treeFromProject(id)` reads Dexie: the project, its live non-archived descendants (`descendants` in `lib/projects.ts`), live sections, live tasks that are open (`completed_at === null`, `deleted_at === null`, no `series_id`), subtasks nested by `parent_id`, label ids resolved to names. The project note fields are copied when present (`project-notes`).
- `treeFromTask(id)` reads one task and its open subtasks.
- `treeFromFile(doc)` validates the shape (format, version ≥ 1, arrays, every task's `project_id` and `section_id` resolve inside the file), nests tasks by `parent_id`, ignores completed, deleted and `series_id` rows, and drops `assignee_id`, `ical_extra` and unknown fields silently (the dialog lists what a file holds, not what it drops; templates are structure).
- `planTree(tree, opts: {parentId, startDay?, referenceDay?, labels: Label[]})` returns `{changes: Change[], projectIds, taskIds, labelsToCreate}`: fresh `crypto.randomUUID()` ids, positions counted upward from `Date.now()` in tree order (projects last among their new siblings, like `createProject`; tasks and sections 1, 2, 3… within their container, which `lib/ordering` tolerates), `created_at = now`, `deleted_at = null`, `assignee_id` absent (null is the default and must not be written for rows the server never saw), `notes_doc` only when non-empty (the rule `copyTasks` already follows, `ops.ts:603`). Labels are resolved by name against the live labels; missing ones become `label` creates in the same batch with the file's colour or the palette default.
- `duplicateTask` plans with `treeFromTask` and places the copy after the original through `planMove` on the original's siblings, in the same batch.

Every caller ends in one `mutateMany(changes)`. The batch is written under one HLC timestamp like every multi-entity write today, which is what makes two devices duplicating the same project converge on two complete copies: ids never collide and no field is contested.

- **Alternative: extend `copyTasks`.** Rejected. It is shaped for moves (it copies completion and assignees, drops sections, and is called with the tombstones); the planner replaces its copy-field rule for the new use without touching the move paths.
- **Alternative: run instantiation through the server importer with a "fresh ids" option.** Rejected. It needs a connection (local-first), a server change, and the import job stamps ops with device `import`, which hides who did it in the activity log.

### D3. Date shifting

`shiftDays = startDay − referenceDay` in calendar days; each `due.date` moves by that many days with `time` and `tz` untouched (a floating date stays floating; a zoned time keeps its zone and wall clock). The reference day is `template.day`, else the UTC date of `exportedAt`, else (duplicate, or a file with neither) the earliest `due.date` in the tree. With no start day chosen the shift is zero. Month-length edge cases do not arise: the shift is a whole number of days, applied with the date arithmetic in `lib/dates.ts`.

Recurrence rules are copied verbatim: `every monday` is independent of the due date, and `every 3 days after completion` counts from the (shifted) due date, which is what a shifted checklist wants.

### D4. Limits

`planTree` refuses a tree with more than 1,000 tasks (`TemplateTooLargeError`) before any op exists. One task is about a dozen ops, so the ceiling is roughly 12,000 ops in one Dexie transaction, uploaded in 24 requests of 500. Larger files go through Settings → Data → Import, which the message names. A duplicate of a project that has more than 1,000 open tasks is refused the same way; the dialog shows the count before the user confirms.

### D5. Save as template: the writer

`fileFromTree(tree, {day})` is the inverse of `treeFromFile`: name-based ids within the file (`nameId('template', path)` from `lib/ids.ts`, so saving the same project twice produces the same file), `exportedAt` now, `template.day` the device's local date, labels limited to those the tasks use, empty `reminders` and `views`. The download is a Blob URL with the name `opentodo-template-<slug>.json`, built on the device from Dexie, so it works offline and needs no route. On an encrypted account the dialog says the file is plaintext.

- **Alternative: a server route that renders a project as a template.** Rejected. It adds an authenticated route and a demo-list entry, cannot serve an encrypted account (the server holds ciphertext), and offers nothing the device cannot do from its own data.

### D6. Where the actions live

- Project menu (`ProjectHeader`): "Duplicate…" (any role: the source is only read) and "Save as template…". Both open a dialog on the overlay primitives; "Duplicate…" has name, parent (the same picker the sidebar's new-project form uses, becoming the smart picker when `task-detail-redesign` migrates it), a "Start on" date field (the `DateField` from `date-time-preferences`, empty = keep dates) and the task count.
- Sidebar: "From a template…" beside the "+" (a menu with "New project" and "From a template…" so the plus stays one control). The dialog has a file input, a summary (projects, sections, tasks, labels, dated tasks), "Start on" defaulting to today, parent, and Create. The resulting project opens.
- Task panel ⋯ menu: "Duplicate" (`canEditTasks`). List: <kbd>Shift</kbd>+<kbd>D</kbd> on the selected task, next to the other task-row shortcuts in `TaskListView`; the copy becomes the selection. The in-panel item is one `MenuItem` beside "Copy link" (`TaskDetail.tsx:98`); if `task-detail-redesign` lands first, the item goes into its redesigned menu.
- Import screen: when the preview response says the file is a template (D7), a note under the format line says "This file is a template. Importing it creates it once; to start a fresh copy with shifted dates use From a template in the sidebar."

### D7. The only server change: a preview hint

`profile_opentodo.Read` decodes an optional `Template *struct{Day string}` and, when present, appends a file-level note to `Parsed.Notes` ("This file is a template …") and sets `Parsed.Template` so the preview JSON carries `template: {day}`. No import behaviour changes. `docs/import.md` documents the key under the own-export section.

## Risks / Trade-offs

- **[A big batch stalls the device]** → The 1,000-task cap (D4) keeps the batch under the sizes the reseed path already handles in one transaction (`sync.ts:235` chunks reseeding at 1,000 ops per `bulkAdd`); the planner uses the same chunked `bulkAdd` inside the `mutateMany` transaction if measurement shows it is needed.
- **[Labels created by two concurrent instantiations collide by name]** → Same as two devices creating a label offline today: both exist after sync and the Labels page shows the duplicate badge with Merge. The planner never writes a label that exists locally.
- **[The website's files have no `template.day`]** → The `exportedAt` fallback matches how those files were generated; the website change adds `template.day` to `toExport` later for clarity.
- **[Recurrence copied with a shifted due date produces an odd first occurrence]** → The copied rule and due are shown in the created project like any task; the dialog's summary counts recurring tasks so the user expects them.
- **[Duplicate of a shared project leaks nothing but surprises a viewer]** → The copy is personal and the dialog says "A personal copy of this project" when the source is shared.
- **[The Import screen and "From a template" overlap]** → The preview hint (D6, D7) and the docs state the difference once: Import keeps ids and runs on the server; From a template makes a fresh copy on the device.

**Size:** no dependency. `lib/templates.ts` plus three dialogs add about 4–5 KB gzipped; the binary grows by the embedded amount; runtime memory unchanged. The server change is a few lines in the importer.

## Migration Plan

None. No schema, no migration, no stored state. Rollback is the previous binary: copies already made are ordinary projects and tasks, and template files remain valid own exports that the Import screen reads.

## Open Questions

- Should "Duplicate…" also offer "include completed tasks" for people who duplicate a finished checklist as a record? It changes neither the format nor the planner's shape (one flag), so it can be added when asked.
