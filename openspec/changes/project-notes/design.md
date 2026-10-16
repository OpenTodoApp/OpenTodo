# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The note machinery is almost generic.** `internal/sync/ops.go` validates a `kDoc` value by envelope only and keys opaque fields by `"entity.field"` (`DocFields`, line 100); `internal/sync/trash.go:109-112`, `internal/webhook/events.go:164-200` and `internal/activity/activity.go:92` consult that map or their own copy. On the client, `web/src/lib/docfields.ts` maps a document field to its projection (`DOC_FIELDS = {'task.notes_doc': 'description'}`), `applyOps` merges any document field through `isDocField` (`ops.ts:113-146`), and `checkEncryptedSize` is keyed the same way (`ops.ts:424`).
- **Three places are task-only.** `withNotePairs` tests `c.entity !== 'task'` and reads `db.tasks` (`ops.ts:328-333`); `foldNote(taskId)` and `reconcileNote` take a task (`ops.ts:212`, `ops.ts:360`); `NotesEditor` takes `{task, readOnly}` and calls `updateTask` (`NotesEditor.tsx:35`, `:66`). `historyVersions.ts:74`, `activityRuns.ts:60` and `HistoryTab.tsx:33` label `description`/`notes_doc` by field name only, so they already fit projects.
- **Roles.** `scope.go:120-131` `CanWrite`: editors write `task` and `section`, admins also `project` except `deleted_at`. The client mirrors it in `web/src/lib/sharing.ts` (`canEditProject`, `canEditTasks`), and `ProjectHeader` uses `canEditProject(role)` for the menu.
- **Project view layout.** `TaskListView.tsx:742-752` renders `ProjectHeader`, then the list/board toggle, then either the sectioned list or `BoardView`. Anything placed right after `ProjectHeader` is above both layouts.
- **Server-side readers.** `agenttools/read.go:114-123` `projectOut` carries `untrusted_text.name` only; `resources.go:29-57` builds the project resource from `renderProject`. `e2ee.Display` and `IsCiphertext` are already used for task text (`data.go:113`, `:283`).
- **Demo sandbox.** `demo/sandbox.go:285` raises the value cap to `MaxNotesBytes` for `task.description` and `task.notes_doc` only.
- **Importer.** `Row` (`importer.go:56-86`) has one `Description` used for task rows; `planForeign` writes `description` for tasks (`plan.go:783`) and creates projects with name, colour and position. `genericProfile` reads `projects[].{id,name,parent_id}`; `itemsProfile` reads `projects[].name, parent_id, inbox_project`.

## Goals / Non-Goals

**Goals:**
- One note implementation for tasks and projects: the client's pairing, folding and editor code become entity-generic, keyed by `DOC_FIELDS`, so a third note field later is a map entry.
- A project note that an editor of a shared project can write, enforced on the server.
- No new route, no Dexie version bump, no dependency.

**Non-Goals:**
- Generalising the server beyond the two map entries it needs (the server never decodes a document).
- A second, short "description" field with its own editor. One note; `description` is its projection.
- Assistant writes, CLI flags, named-importer mappings (see proposal, out of scope).

## Decisions

### D1. The same field pair as tasks: `description` + `notes_doc`

`project.description` (`kString`) and `project.notes_doc` (`kDoc`) are added to `Schema`. `DocFields` gets `"project.notes_doc"`, and so do `activity.Opaque` and `OPAQUE` in `lib/activity.ts`, with a project note op added to `activity_fixture.json` that must classify as `edited` with `description` as the readable field and never surface `notes_doc`. `DOC_FIELDS` gets `'project.notes_doc': 'description'`.

Using the same names keeps every reader that already special-cases `description`/`notes_doc` by field name correct (history labels, activity nouns, trash restore), and keeps the sync doc's "Mergeable documents" section true for both entities with one sentence changed.

- **Alternative: a single `notes` Markdown string on the project.** Rejected. Two people editing the brief at once would overwrite each other under last-writer-wins, which is the exact problem `collaborative-rich-text` solved; and the roadmap row names `notes_doc`.
- **Alternative: a separate `notes` entity keyed by project.** Rejected. It adds a Dexie table, scope resolution and an entity map entry in six places, for no behaviour the field pair lacks.

**Data model impact:** two additive fields on `project`; nothing renamed or retyped. Rows synced before this change lack the keys; every reader treats `undefined` as `''` (the `DEFAULTS` entry in `ops.ts:87` supplies the defaults for rows created after). No Dexie version: the fields are not indexed. The export carries them automatically (`handleExport` lists whole entities), and `planOwn` restores them because it iterates `opsync.Schema[row.Kind]`.

### D2. Entity-generic note pairing on the client

`withNotePairs`, `foldNote` and `reconcileNote` are rewritten to take `(entity, id)` and look the row up through `tableFor(entity)`; the projection field name comes from `DOC_FIELDS`. The rule set is unchanged (merge before write, projection in the same batch, fold a newer plain-text write, lazy upgrade of a legacy note). `updateProject` keeps its signature; `mutate('project', id, {notes_doc})` goes through the same pairing as a task write. The existing note tests in `web/src/lib/notes.test.ts` are run against both entities with a parameterised table so the behaviours cannot drift.

- **Alternative: duplicate the three functions for projects.** Rejected. Two copies of a convergence rule is how convergence breaks.

### D3. Editors may write the note; the server decides

`CanWrite` gains a clause: an editor may write `project` fields `description` and `notes_doc`. Refusals keep the existing path (`forbidden`, server value travels back, the device adopts it). On the client, `sharing.ts` gets `canEditProjectNote(role)` = editor, admin or owner, used by the note component; `canEditProject` stays admin-level for rename, colour, move and archive.

- **Alternative: admin-only, like every other project field.** Rejected. The people doing the work of a shared project are editors by default (invite links offer viewer or editor), and the note exists for them. Recorded as an assumption for the maintainer: the project-sharing delta is the one spec change that widens a role.

### D4. Rendering: projection when reading, editor when editing

A `ProjectNote` component is rendered by `TaskListView` right after `ProjectHeader`, so it sits above the list and the board without touching `BoardView`. It reads the project row live and renders `description` through the existing `Markdown` component inside a `<section aria-label="Project note">`. When the user may edit, the rendered note is a button-like region ("Edit note", `Shift+P` hint; `Shift+N` was the first choice but `someday-and-evening` uses it in the same list context to defer the selected task, and `Shift+P` is free in the app and in every sibling change); activating it or pressing <kbd>Shift</kbd>+<kbd>P</kbd> (ignored while an input, textarea or contenteditable has focus, like `m` and `Shift+S` in `ProjectHeader.tsx:46-62`) swaps in `NotesEditor` with the caret at the end; <kbd>Esc</kbd> blurs the editor, which flushes the save and returns to the rendered view. A project without a note shows a muted "Add a note" button to editors and nothing to viewers.

Folding: a note taller than about eight lines is clipped with a "Show more / Show less" toggle; the state is kept in Dexie `meta` under `project.noteFolded.<id>` (per device, like the list/board choice).

`NotesEditor` becomes `NotesEditor({entity, id, value, clock, readOnly})`: it was already built around a document string and a save callback; the task-specific parts are the `foldNote(taskId)` effect and `updateTask`, which become `foldNote(entity, id)` and `mutate(entity, id, {notes_doc})`. The task detail keeps using it unchanged in behaviour.

- **Alternative: always mount the editor in read-only mode.** Rejected. It would load ProseMirror and Yjs on every project view; the Markdown renderer is already in the main bundle and reads without JavaScript-heavy code.
- **Alternative: a "Notes" tab or panel.** Rejected. The roadmap asks for a pinned note at the top; a brief that is hidden behind a tab is not read.

### D5. Server readers show the projection, never the document

- `projectOut` gains `untrusted_text.description` (through `e2ee.Display`) and `encrypted` (true when `name` or `description` is ciphertext); `ProjectResource` reuses `renderProject`. `update_project` is untouched, so `a.only("", "id", "name", "color")` keeps refusing a `description` argument.
- `demo/sandbox.go` `CheckOp` applies `MaxNotesBytes` to `project.description` and `project.notes_doc` as well, by consulting a small set `{task.description, task.notes_doc, project.description, project.notes_doc}`.
- History, webhooks and trash need no code: they consult `IsDocField`.

### D6. Importer: project descriptions from JSON profiles

`Row.Description` is reused for `KindProject` rows. `genericProfile` and `itemsProfile` read `description`, `notes`, `note` on project objects; `planForeign` writes `description` on a created project and leaves a reused project alone. Undo already removes every op of the job. CSV has no project rows, so no column is added. The named app importers (`named-importers`) map a project description where their source has one; this change does not touch their profiles.

### D7. Encryption

Both fields join `ContentFields["project"]` and `CONTENT_FIELDS.project`. `checkEncryptedSize` already applies the document cap to a content document field by `isDocField`, so the encrypted-document limit (`MAX_DOC_CHARS_ENCRYPTED`) holds for projects without new code. The enable-time migration encrypts existing content fields by iterating `CONTENT_FIELDS`, so existing project descriptions (empty until this change) are covered; an account that enabled encryption before this change encrypts the new fields on first write. `docs/e2ee.md`'s list of hidden fields gains "project descriptions and notes".

### Interface budget (added after ux-overhaul)

- The note is content between the quick add and the first section, not chrome. An empty note costs editors one quiet line and viewers nothing; a long note folds after about eight lines.
- One new shortcut, Shift+P, registered in the shortcut list.
- No new scroll region, sidebar destination or task property.

## Risks / Trade-offs

- **[Older server refuses `project.description`/`notes_doc` ops as `invalid_op`]** → Same as every additive field: client and server ship in one binary, and a device talking to an older server keeps its local note until the server is upgraded. The sync protocol's invalid-op handling applies; no data is lost. Release notes say so.
- **[Older clients ignore the fields]** → They render projects as before; a plain-text `description` write from them (none exists today, since no older client writes project descriptions) would fold in like a REST write.
- **[Editors gain a project-level write]** → Limited to the two note fields, enforced in `CanWrite` with a test per role; rename, colour, parent and archive stay refused for editors. The maintainer confirms the choice (D3).
- **[The note pushes the task list down on phones]** → The fold (D4) caps it at about eight lines, and an empty note takes no space for viewers and one line for editors.
- **[Making the pairing generic regresses task notes]** → The existing note tests run unchanged for tasks and again for projects; the activity fixture pins opaque handling on both sides.
- **[Demo sandbox: 32 KB notes on projects]** → Covered by the same cap as task notes; the sandbox's total byte budget is unchanged.

**Size:** no dependency. About 2 KB gzipped for `ProjectNote` and the generalised editor props; the editor chunk is unchanged and still lazy. Container image and runtime memory unchanged beyond the embedded bundle growth.

## Migration Plan

No data migration and no SQLite migration: fields are additive, absent values mean an empty note. Deploy the binary; devices pick up the schema on their next sync. Rollback is the previous binary: stored note ops stay inert in the log, new ones are refused as unknown fields, and older clients keep showing projects without notes.

## Open Questions

- Should the project note's first line double as the project's description in the sidebar tooltip and in search results (`search-and-command-palette`)? It needs no spec or data change here; the palette change can read `description` when it lands.
