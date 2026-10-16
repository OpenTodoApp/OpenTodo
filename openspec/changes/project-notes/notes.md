# Implementation notes

## Status (2026-10-15)

Done on `feat/project-notes`: groups 1, 2, 3 and 5: `project.description` and `project.notes_doc` in the schema and `DocFields`, editors may write them (`CanWrite`), opaque in activity, the demo notes cap, history and webhook exclusion of the document, encryption content fields on both sides, the client type and defaults, entity-generic note merging (`withNotePairs`, `foldNote(entity, id)`, `reconcileNote`, remote merge in `applyOps`), `canEditProjectNote`, `list_projects` and the project resource with `untrusted_text.description` and `encrypted`, project descriptions from `json-generic` and `json-items` for created projects, the export round trip, and the docs (`sync.md`, `sharing.md`, `api.md`, `e2ee.md`, `import.md`, `mcp.md`).

Held until the ux-overhaul PRs (now through its group 4) merge: group 4 (`NotesEditor` generalisation, `ProjectNote`, Shift+P, history labels, the user guide section), the smoke test and `make check`.

## Decisions taken while implementing

- `foldNote(taskId)` keeps working; `foldNote(entity, id)` is the new form, so the task editor did not have to change before the screen work.
- The project tests live in `projectNotes.test.ts` (the same scenarios as `notes.test.ts`) instead of parameterising the task file, to keep that file's simulated server unchanged.
- ux-overhaul group 4 adds `project.icon` to the same schema block; the two additions merge trivially.

## Screens (2026-10-16)

- `NotesEditor` takes a `NoteTarget` (`{entity, id, notes_doc, description, _clock}`), writes through `mutate(entity, …)` and folds with `foldNote(entity, id)`. The task panel passes `{...task, entity: 'task'}`, and the task-notes tests pass unchanged.
- `ProjectNote` renders below the project's quick add (above the sections, the board and the timeline) rather than between the header and quick add. Chrome stays together above content (ux-overhaul's "Chrome above content, never between"), and the note is still "directly above the tasks".
- The rendered note uses `Markdown` with a new `rich` flag: `#` headings and `[ ]` / `[x]` check items, which a note's projection carries and the comment subset lacks. Comments are unchanged. Without the flag, a note heading showed as a literal "# Packing".
- Projects can restore an earlier `description` from History (`RESTORABLE.project`), and `fieldLabel` reads `description` and `notes_doc` as "notes".
- Until the membership row loads, the note renders nothing, so a viewer never sees "Add a note" flash.

## Smoke test (2026-10-16, task 6.1)

Setup: `./bin/opentodo` on 127.0.0.1:18080, an owner and an editor ("Sam", invited, then given the editor role on "Trip"), two headless Chromium contexts.

- The owner pressed Shift+P on "Trip" and typed a heading, a check item and a line, then Esc. Sam's device showed the note after a sync.
- Both opened the editor at the same time and typed at the end ("From owner", "From Sam"). After both closed it, `GET /api/v1/projects/{id}` held both lines in `description`.
- On the board layout the note stayed above the columns.
- Sam wrote `description` over `PATCH /api/v1/projects/{id}`. The owner's device showed the new text, and opening the editor folded it, so the server then held a `notes_doc` paired with the new Markdown.

## Merge with main (2026-10-16, after ux-overhaul, month-and-timeline-views, quick-add-recurrence)

- Shift+P is the registry entry `project.note` (scope `view`, views `['project']`), handled by `ProjectNote` through `useShortcutScope`; the component has no `keydown` listener of its own. The "Add a note" line prints the key only with **Show shortcut hints** on (`<Kbd only>`).
- The note renders below the quick add and above the sub-projects group, the sections, the board and the timeline. The interface budget test counts the empty note's one quiet line for an editor; a project stays within its allowance.
- `NotesEditor` keeps main's quiet-at-rest, bordered-while-focused behaviour for the task panel and the `NoteTarget` generalisation for projects.
- The user guide section moved from the hub (`docs/tasks-and-projects.md`, now a one-sentence pointer) to its own page `docs/project-notes.md` (Guides, order 18), listed in `docs/README.md`; the roles table lives on `docs/roles-and-assignments.md`, and `docs/sharing.md` names the note in its one-line role summary. The page reuses the project-list screenshot until a note screenshot is captured.
- The `end-to-end-encryption` delta mirrors the live requirement (its attachment scenarios included) plus the project-note scenario.
