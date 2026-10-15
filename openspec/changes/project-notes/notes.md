# Implementation notes

## Status (2026-10-15)

Done on `feat/project-notes`: groups 1, 2, 3 and 5: `project.description` and `project.notes_doc` in the schema and `DocFields`, editors may write them (`CanWrite`), opaque in activity, the demo notes cap, history and webhook exclusion of the document, encryption content fields on both sides, the client type and defaults, entity-generic note merging (`withNotePairs`, `foldNote(entity, id)`, `reconcileNote`, remote merge in `applyOps`), `canEditProjectNote`, `list_projects` and the project resource with `untrusted_text.description` and `encrypted`, project descriptions from `json-generic` and `json-items` for created projects, the export round trip, and the docs (`sync.md`, `sharing.md`, `api.md`, `e2ee.md`, `import.md`, `mcp.md`).

Held until the ux-overhaul PRs (now through its group 4) merge: group 4 (`NotesEditor` generalisation, `ProjectNote`, Shift+P, history labels, the user guide section), the smoke test and `make check`.

## Decisions taken while implementing

- `foldNote(taskId)` keeps working; `foldNote(entity, id)` is the new form, so the task editor did not have to change before the screen work.
- The project tests live in `projectNotes.test.ts` (the same scenarios as `notes.test.ts`) instead of parameterising the task file, to keep that file's simulated server unchanged.
- ux-overhaul group 4 adds `project.icon` to the same schema block; the two additions merge trivially.
