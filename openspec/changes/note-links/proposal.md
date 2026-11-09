# Proposal

## Why

Notes in OpenTodo live in three places (task notes, project notes, standalone notes), and nothing ties them together: a meeting note cannot point to the tasks it produced, and a task cannot show which notes talk about it. Links are the smallest step that turns separate notes into a connected place, and the Notes area changes after this one (`notes-home`, `notes-graph`) are built on them.

## What Changes

- Typing `[[` in a note (task, project or standalone) opens a picker of notes, tasks and projects; choosing one inserts a link that holds the target's id and always reads as the target's current title, so renaming never breaks it. The `/` menu gains **Link to…**, which does the same. The picker's last row creates a new note with the typed text and links it.
- A link is stored as the editor's existing link formatting with an in-app address (`?note=<id>`, `?task=<id>`, `?project=<id>`), the form **Make subtask** already writes for tasks. A 1.0 client therefore shows it as readable text and keeps it through its own edits, the Markdown projection reads `[Title](?note=<id>)`, and a script or agent can create a link by writing that Markdown.
- A link to something deleted, in the Trash or out of reach (a shared project's member cannot see the target) reads as its last known title in the muted tone and is not a link; it comes back when the target is restored.
- A **Linked references** section lists every note, task note and project note that links here, with the text around the link: at the end of a standalone note, below a task's notes, and as one folded line in a project's note area. Hidden when nothing links here.
- Linked references are computed on the device from the local, decrypted notes, so they work offline and on encrypted accounts; the server keeps no link table and learns nothing about links on an encrypted account.
- Opening `?note=<id>` and `?project=<id>` addresses from anywhere, as `?task=<id>` already opens a task.
- For unencrypted accounts, the MCP tools `get_note` and `get_task` return `links` and `linked_from`; `ot notes links <ref>` prints both, computed on the user's machine, so it also works with an unlocked encrypted profile. The note write tools' descriptions document the link form.
- No new op field, no new REST route, no new dependency. Not **BREAKING**: no new mandatory environment variable, no change to the op log format.

Out of scope: links in comments; links with custom text (an alias); "unlinked mentions" (plain text that happens to match a title); links to labels, views or sections; a server link table; the Notes home and the graph (the next two changes); the Markdown vault and CalDAV mapping links to their own syntaxes (they carry the projection unchanged).

Roadmap: the first of the three steps of "Notes area" in ROADMAP.md (`note-links`, then `notes-home`, then `notes-graph`).

## Capabilities

### New Capabilities

- `note-links`: links between notes, tasks and projects written with `[[`, how they are stored, rendered and degraded, the Linked references section, the link index on the device, the `?note=` and `?project=` addresses, and links in MCP, the CLI, the export and older clients.

### Modified Capabilities

- `rich-text-editing`: the slash command menu offers **Link to…** in notes.

## Impact

- Web: `web/src/lib/richtextEditor.ts` (an inline link node in the editor, mapped to and from the stored link formatting), `web/src/lib/editorSuggest.ts` (the `[[` trigger), `web/src/app/NotesEditor.tsx` (picker, node view), a new lazy `web/src/lib/noteLinks.ts` (link parser and index), `web/src/app/Markdown.tsx` and `web/src/lib/markdown.ts` (render `?note=` and `?project=` links with current titles), the task page, the note panel and the project note (Linked references), `web/src/app/Shell.tsx` (addresses), the six language catalogues.
- Server and CLI: a new `internal/notelinks` (the link grammar in Go, pinned by vectors shared with `web/src/lib/noteLinks.ts`, listed in `docs/contracts.md`); `internal/agenttools/read_notes.go` and the task read; `internal/cli/cmd_notes.go` (`ot notes links`).
- Performance: one new nightly metric (`note-references`) on the notes fixture, which gains links (`internal/perfseed/notes.go`); first load unchanged within the gzip budget (the index and picker load with the editor's lazy chunk).
- Docs: `docs/formatting.md`, `docs/notes.md`, `docs/notes-to-tasks.md`, `docs/contracts.md`.
