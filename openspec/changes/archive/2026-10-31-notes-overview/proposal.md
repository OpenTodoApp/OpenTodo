# A Notes page, standalone notes and note search

## Why

OpenTodo already holds a lot of writing: every task and every project can carry a rich-text note (ProseMirror + Yjs, `rich-text-editing`, `project-notes`). But a note can only be found by first finding its task or project, and there is nowhere to write something that is not a task: meeting notes, a reference page for a project, a packing list kept for next year. People who leave Todoist, TickTick or Things keep a second app for that. The owner brainstormed the feature (DECISIONS.md, "Notes feature", 2026-10-31): a sidebar **Notes** page that lists task notes, project notes and a new kind of **standalone note**, searchable on the device (so it works offline and with end-to-end encryption), with no folders (projects and labels organise notes), the standalone note's title encrypted like any content, and sharing only through the note's project. It comes after `notes-compaction` and `notes-save-cadence`, which make many long, often-edited notes affordable to store and sync.

## What Changes

- **Standalone notes.** A new synced entity `note`: `title`, `notes_doc` and its Markdown projection `description` (the same mergeable document and pairing rules as task and project notes), an optional `project_id`, `labels`, `position`, `created_at`, `deleted_at`, and `workspace_id` for a note without a project. It is an additive op schema entry (AGENTS.md rule 3); `title`, `description` and `notes_doc` are content, encrypted on encrypted accounts. A note lives in its project's sharing scope like a task (personal without a project); it is shared only by being in a shared project, where editors write it and viewers read it.
- **Notes page** (`/notes`), lazily loaded, in the sidebar's More group (promotable like Focus), `g e`:
  - lists **task notes** (tasks with a non-empty note), **project notes** and **standalone notes**, newest change first, 50 at a time with **Show more**;
  - filters **Source** (All, Task notes, Project notes, Standalone only), **Project** and **Label**, paginated the same way;
  - a **search** field that searches titles and the decrypted Markdown projections on the device, with the matched words highlighted in a snippet; no new dependency;
  - **New note** (`q` on the page), and the note opens in the docked panel on a computer and as a page on a phone.
- **Search everywhere.** The command palette (`Ctrl+K`) finds standalone and project notes, with a snippet; tasks found by their notes show the snippet too. The filter language gains `notes`, `no notes` and `notes: text` (TypeScript and Go parsers, shared vectors in `internal/filter/testdata/formatted.txt`).
- **Turn a note into a task** (title, note, project and labels carried over; the note goes to the Trash) and **move a task's note out** into a standalone note (the task keeps its title and loses its note), each with one Undo.
- **Trash and history:** standalone notes go to the Trash, are restored, purged and expire like tasks; `GET /api/v1/notes/{id}/history` and `DELETE /api/v1/notes/{id}/purge` join the task and project routes.
- **Everywhere it travels**, decided explicitly (design D9):
  - **in:** sync, the REST collection `/api/v1/notes` (through the generic collection routes), the JSON export and its import, `ot notes` (list, search, show, add, edit, append, rm, to-task) and `ot task note`, MCP read tools (`list_notes`, `search_notes`, `get_note`), the resources `opentodo://notes` and `opentodo://notes/{id}`, MCP write tools (`create_note`, `update_note`, `append_to_note`, `trash_note`, `note_to_task`) through the agent write gate, the in-app assistant through the same tools, compaction (`note.notes_doc` is a document field);
  - **out, with the reason:** CalDAV (tasks only; `VJOURNAL` is barely supported by calendar apps), the Markdown vault (a later change can map notes to files), webhooks, the activity feed and automation rules (task and project events only), mentions, attachments, images and "make subtask" inside standalone notes, importing notes from other apps.
- **CLI and MCP, reads and writes** (owner decision 2026-10-31, design D12, D13): `ot notes list|search|show|add|edit|append|rm|to-task` and `ot task note <ref>` (a task's note as Markdown), table and `--json`, writing through REST; MCP read tools `list_notes`, `search_notes`, `get_note`, resources `opentodo://notes` and `opentodo://notes/{id}`, and write tools `create_note`, `update_note`, `append_to_note`, `trash_note`, `note_to_task` behind the existing agent write gate, with untrusted-text marking, the write limits and `agent.write` audit. A plain-text replace folds into the document by the existing fold-back rule, guarded by a version check (`If-Match` / `base_version`, 409 `body_changed`); an **append** is a new additive field family `appends.<id>` on tasks and notes that devices insert at the end of the document (rule 5), so it never overwrites concurrent rich edits. Encrypted accounts behave as the existing tools do: the CLI with an unlocked profile and `ot mcp --decrypt` encrypt on the user's machine, an opted-in device relays, otherwise text is ciphertext only.
- **Phones:** the list is touch-first (48 px rows, filters in a sheet, the search field at the top), the editor uses the touch formatting row.
- Strings in the six languages.

Not **BREAKING**: one additive entity, one additive field family (`appends.<id>` on `task` and `note`) and additive filter keywords; new routes follow the policy wrapper; the optional `If-Match` on `PATCH` changes nothing for callers that do not send it; no new environment variable.

## Out of scope

- Folders or nested notes (projects and labels are the structure).
- Sharing a single note, public links to notes.
- Typo-tolerant search. If wanted later, MiniSearch (about 7 KB gzip, MIT) is the fallback recorded in design D4.
- Lazy note bodies on devices (`notes-on-demand`, only if `performance-10k`'s notes budgets fail).
- Backlinks, wiki links between notes, templates for notes.
- Notes in the Markdown vault, CalDAV, webhooks, activity and automations (see What Changes).
- Permanent deletion of notes from the CLI or MCP (the Trash and its purge stay in the app); `trash_note` takes only notes the same agent token created, like `trash_tasks`.
- Server-side search of encrypted notes (`search_notes` on an encrypted account works only through `ot mcp --decrypt`, which searches on the user's machine).

## Roadmap

Advances milestone 0.19 "Series and time", item `notes-overview`, the last of the notes changes. **Depends on** `notes-compaction` and `notes-save-cadence`; uses `notes-toolbar-desktop`'s toggle when present. Its notes budgets are part of `performance-10k`. GitHub issue: [#655](https://github.com/OpenTodoApp/OpenTodo/issues/655).

## Capabilities

### New Capabilities

- `standalone-notes`: the `note` entity, its scope and sharing, editing, conversions to and from tasks, encryption, and its REST, CLI, MCP, export and import coverage, with what is left out.
- `notes-page`: the Notes page, its list, filters, pagination, on-device search with snippets, phone and keyboard behaviour.

### Modified Capabilities

- `app-shell`: ADDED "Notes in the More group".
- `command-palette`: ADDED "Notes in search".
- `filter-queries`: ADDED "Notes terms".
- `trash-and-history`: ADDED "Standalone notes in the Trash and history".
- `rich-text-editing`: ADDED "Appended text merges into the document" and "Plain-text replacement checks the version".
- `cli-client`: ADDED "Task note command".

## Impact

- **Op schema and sync:** `internal/sync/ops.go` (`note` in `Schema`, `DocFields`, `Plural` `notes`), `scope.go` (`note` as a project child; `CanWrite` for editors), `members.go` (first-share relabel, deleting a shared project), `trash.go` (purge, retention, cascade from a purged project); regenerated `web/src/generated/opSchema.ts`, `internal/e2ee/contentfields.go`, the contract fixture.
- **Server features:** `internal/httpapi` (history and purge routes, export, the importer of the own export, the append and to-task routes, `If-Match` on `PATCH`), `internal/agenttools` and `internal/mcp` (three read tools, two resources, five write tools), `internal/cli` (`ot notes`, `ot task note`, the decrypting bridge's attribution table), `internal/notesearch` (Go port of the search matcher, shared vectors), `internal/filter` (the terms); `internal/sync` receipt rules for `appends.<id>`.
- **Web:** Dexie table `notes` (version bump), `web/src/lib/ops.ts` (entity, conversions, the append fold of rule 5), `web/src/lib/notes.ts` (the list, the updated time, the search index and snippets), `web/src/lib/filter`, `web/src/app/notes/` (page, rows, filters, note panel), the palette entries, the sidebar, the Trash; stories; six catalogs.
- **Size:** no new dependency. The page, its search and the note panel load lazily; first-load growth about 1.5 KB gzip (the route, the sidebar entry, the palette's note entries and the filter terms). Binary growth negligible.
