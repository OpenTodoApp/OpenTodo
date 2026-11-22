# Design

## Context

Both engines match a changed file to a project in one pass (`mapFiles` in `internal/vault/merge.go`, `mapFiles` in `obsidian/src/vault/merge.ts`):
- `Inbox.md` is the Inbox.
- A file whose front matter holds a known `opentodo-id` is that project's file. It is claimed once, so a copied file becomes a new project.
- Everything else becomes a new project (`newProject`).

The state file already records, for every file the last sync wrote, its project (`files[path].project`). That record is the vault's memory of "the file at this path is project X". `projectEdits` then reads front-matter edits: a colour is applied only when it is non-empty, but an icon is applied even when empty, so a file without front matter would clear the project's icon.

The half-saved hold (the `vault-watch` fix this builds on) keeps a file that is empty mid-save out of the merge. This change concerns only files that are merged.

## Goals / Non-Goals

**Goals:**
- A file without `opentodo-id`, at a path whose recorded project is live and not claimed by another file this sync, is that project's file.
- A file without front matter never changes the project's colour or icon.

**Non-Goals:**
- Changing how an unknown `opentodo-id` is handled. It stays a new project with a warning: someone pasted or edited an id, and guessing is unsafe.
- Matching a front-matter-less file by name at a new path.

## Decisions

1. **The state's file record is the fallback key, after the id.** In `mapFiles`, a file with an empty `opentodo-id` whose path is in the state's `files` takes the recorded project, but only if that project is live and not claimed by another file this sync. An archived or trashed recorded project falls through to "new project", as today: its file was meant to go. The id still wins, so moving a file with its front matter behaves as before. The alternative was matching by file name against project names. It was rejected because a name is not an identity (two projects can share one under different parents), and the path record is already the engine's own memory.
2. **The claim order stays deterministic.** Files are walked in the existing sorted order. A file holding the project's id elsewhere in the vault claims it first: front-matter ids are matched in a first pass, and path records in a second pass over the files left. A copy of `Home.md` that keeps its front matter is still the project's file, and the emptied original then becomes a new project only if its recorded project was claimed by the id. Two passes, ids first, make that independent of path sort order.
3. **No front-matter edits from a file matched by its path.** Without its `opentodo-id`, a file's front matter is gone or was rewritten, and reading it would clear the colour, the icon, the flow and the review status (each "missing" value reads as an edit to the default). So a path-matched file reads no front-matter edits at all. Its name and parent are compared as today; both come from the path, so they don't change at the same path. The next write restores the front matter from the app, as for any file the plan prints. The alternative, reading the keys that are present, was rejected: a file whose `opentodo-id` line alone was deleted is rare, and the app stays the source for those fields until the id is back.
4. **Both engines, one vector.** The Go change is made first. A new case in `internal/vault/syncvectors_cases_test.go` (`front-matter-lost`):
   - init;
   - delete the front matter of a file whose project has an icon, keeping its lines;
   - sync;
   - empty another file;
   - sync past the half-saved hold.

   The vector is generated with `-update`, and the plugin's `engine.test.ts` replays it, so the TypeScript port is checked against Go output.

## Risks / Trade-offs

- [Someone replaces a file's whole content with an unrelated list at the same path, expecting a new project] → It merges into the existing project, as an edit of that file always did when the front matter was kept. The output lists the created and trashed tasks, and the trash restores them. That is preferable to a silent duplicate.
- [An old state file without the path record (first sync, `--take-over`)] → There is no record, so behaviour is as today: a new project. The first sync of a fresh vault writes every file with front matter, so this needs a file that lost its front matter before any sync recorded it.
- [The two engines drift] → The shared vector fails on the one that differs.

## Migration Plan

None: there is no data or state change, and rollback is a revert. Older binaries keep today's behaviour on the same folder.
