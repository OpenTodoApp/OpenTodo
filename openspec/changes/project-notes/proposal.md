# Proposal

## Why

A project in OpenTodo is a name, a colour and a list of tasks (`web/src/lib/types.ts:39-49`, `internal/sync/ops.go:138-146`). There is nowhere to write what the project is for, the address of the venue, the rules of the shared shopping list or the brief a team agreed on; people put it in a task called "README" and hope nobody completes it. Tasks got collaborative rich-text notes with `collaborative-rich-text` (`task.notes_doc` plus the `description` projection, `docs/sync.md` "Mergeable documents"), and that machinery is written to be generic (`web/src/lib/docfields.ts` maps a document field to its projection field; `internal/sync/ops.go:100` `DocFields`), but only tasks use it. Todoist and Things both show a description at the top of a project, and the website's GTD and household templates (`project-templates`) need somewhere to put their instructions.

## What Changes

- **Two additive project fields:** `description` (a string, the Markdown projection) and `notes_doc` (an opaque mergeable document), exactly the pair a task has. Both default to empty, are written through the op log, work offline and converge under the rules of `rich-text-editing`: concurrent edits merge instead of overwriting, plain-text writes (REST, older clients) are folded into the document, and the projection is written in the same batch.
- **A pinned note at the top of every project.** Under the project header, above the list and above the board, the note is shown rendered. An editor or admin opens it in place (click, or <kbd>Shift</kbd>+<kbd>N</kbd>) in the same rich-text editor as task notes; a viewer reads it. An empty note is a quiet "Add a note" affordance for people who may edit, nothing for viewers. Long notes fold after a few lines, remembered per device.
- **Who may edit it in a shared project:** editors, admins and the owner. Today the server lets only admins and the owner write any project field (`internal/sync/scope.go:120-131`); the note is the one project field an editor may write, because it is the shared place for the people doing the work. Rename, colour, archive and parent stay admin-only.
- **Content for encrypted accounts:** both fields join the content field lists (`internal/e2ee.ContentFields`, `CONTENT_FIELDS`), so an encrypted account's project note never leaves the device in plaintext, like task notes and project names.
- **Everything that reads text keeps reading text:** the REST API, the JSON export and the own-export import carry both fields; history, activity, webhooks and the demo sandbox treat `project.notes_doc` as opaque and show `description` as the readable revision, as they do for tasks; MCP and the in-app assistant see the description (placeholder when encrypted) in `list_projects` and the project resource, read-only.
- **Import:** the JSON profiles that read a `projects` array (`json-generic`, `json-items`) map a project's `description`, `notes` or `note` to the project's description. The app-specific importers belong to `named-importers` and map it there where their source has one.

Out of scope:
- Assistant and MCP write tools for the note (`update_project` keeps `name` and `color`). An assistant may read the brief, not rewrite it; a later change can add it with the same change-set review as task descriptions.
- CLI commands for the note (`ot project list --json` already passes every field through; `ot project add --description` can follow).
- A separate short "description" distinct from the note. The roadmap row says "a description and a pinned note"; this change reads that as one note whose first lines serve as the description, rather than two fields with two editors. Recorded as a refinement for the maintainer to confirm.
- Notes on sections, labels or saved views.
- Showing the project note anywhere but the project's own view (sidebar hover, search results).

ROADMAP: advances "Next: Parity and depth" row 16, **Project notes** (`project-notes`).

Nothing here is **BREAKING**: two additive fields on an existing entity, no new route, no new environment variable, no dependency. An older server rejects an op for an unknown field as `invalid_op`, as it does for every additive field (see Design, Risks).

## Capabilities

### New Capabilities
- `project-notes`: the note on a project: its two fields, where and how it is shown and edited, who may edit it, and how it reaches the API, export, history, integrations and encrypted accounts.

### Modified Capabilities
- `project-organization`: "Project fields" gains the description and note fields.
- `project-sharing`: "Role permissions" lets editors edit the project note.
- `end-to-end-encryption`: "Encrypted and plaintext fields" lists the project description and note as encrypted content.
- `data-import`: a new requirement maps a project's description from the JSON profiles that carry projects.
- `mcp-server`: a new requirement adds the project description to `list_projects` and the project resource.

## Impact

- **Op schema:** `project.description` (`kString`) and `project.notes_doc` (`kDoc`) in `internal/sync/ops.go` `Schema`; `DocFields` gains `project.notes_doc`; `internal/activity.Opaque` and `web/src/lib/activity.ts` `OPAQUE` the same, pinned by the shared fixture. `internal/e2ee.ContentFields` and `web/src/lib/e2ee.ts` `CONTENT_FIELDS` add both fields under `project`. `internal/sync/scope.go` `CanWrite` admits an editor to these two fields.
- **Web:** `web/src/lib/types.ts` `Project`, defaults in `web/src/lib/ops.ts` and its note pairing (`withNotePairs`, `foldNote`, `reconcileNote`, today task-only at `ops.ts:328` and `ops.ts:360`), `web/src/lib/docfields.ts` `DOC_FIELDS`, `web/src/app/NotesEditor.tsx` (takes a task today, `NotesEditor.tsx:35`), a `ProjectNote` component under `ProjectHeader` in `web/src/app/TaskListView.tsx:742`, `web/src/lib/shortcuts.ts`, the project history labels in `web/src/lib/historyVersions.ts` and `activityRuns.ts`. No Dexie version bump: the fields need no index.
- **Server reads:** `internal/agenttools/read.go` `projectOut` and `resources.go` `ProjectResource` (description through `e2ee.Display`); `internal/demo/sandbox.go` `CheckOp` applies the notes cap to the project fields; `internal/importer` JSON profiles and `Row` for project descriptions.
- **Docs:** `docs/tasks-and-projects.md` (a "Project notes" section), `docs/sync.md` (entity table and "Mergeable documents"), `docs/api.md` "Project fields", `docs/sharing.md` roles, `docs/e2ee.md` (what is encrypted), `docs/import.md` (project description keys), `docs/mcp.md` (`list_projects` fields), and the keyboard guide through the shortcut table.
- **Size:** no new dependency. The editor chunk (ProseMirror and Yjs) is already lazy; the project view loads it only when the note is opened for editing. Rendering the note uses the existing Markdown component. About 2 KB gzipped added to the web bundle; the binary grows by that embedded amount; runtime memory unchanged.
