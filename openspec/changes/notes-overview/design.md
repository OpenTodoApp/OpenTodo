# Design

## Context

- Task and project notes: `notes_doc` (`kDoc`, a full Yjs state, at most 256 KB) and its Markdown projection `description` (at most 64 KB), written as a pair; merge-and-republish on every device (docs/sync.md "Mergeable documents"). `sync.DocFields` lists the document fields; history, webhooks and activity leave them out and read the projection.
- Entities that live in a project's sharing scope are the "project children" of `internal/sync/scope.go` (`projectChild`: task, section, field), resolved by `project_id`; `CanWrite` decides per role; first share relabels the children (`members.go`); purging a project cascades (`trash.go`).
- The REST collection routes (`GET|POST /api/v1/{collection}`, `GET|PATCH|DELETE /api/v1/{collection}/{id}`) serve every entity listed in `sync.Plural`, and the JSON export iterates the same map.
- The editor is `web/src/app/NotesEditor.tsx` (lazy chunk), used for `entity: 'task' | 'project'`; mentions are computed only for tasks, image handlers need a task's attachments, "make subtask" needs a task.
- Search today: the command palette (`web/src/app/palette/`) finds tasks by title, notes text and origin, from local tables only. The filter language has a TypeScript parser and evaluator and a Go parser (`internal/filter`) for validating saved views, with shared queries in `internal/filter/testdata/formatted.txt`.
- The web store is Dexie (`web/src/lib/db.ts`, version 26), one table per entity, each row holding a per-field `_clock`.
- Sidebar budget: at most 6 primary destinations; Focus is the model of a More destination that can be promoted.

## Decisions

**D1. A `note` entity, not a flagged task.** Fields (`internal/sync/ops.go` `Schema`, additive):

| Field | Kind | Default | Content | Notes |
|---|---|---|---|---|
| `title` | string | `""` | yes | at most the task title limit; empty reads "Untitled note" |
| `notes_doc` | doc | `""` | yes | listed in `DocFields` |
| `description` | string | `""` | yes | the projection, written with `notes_doc` |
| `project_id` | nullable string | `null` | no | decides the scope (D2) |
| `labels` | string list | `[]` | no | label ids, one LWW array like `task.labels` |
| `position` | number | `0` | no | written at creation (the creation time), kept for a later manual order; the page sorts by recency |
| `created_at` | number | `0` | no | |
| `deleted_at` | nullable number | `null` | no | tombstone |
| `workspace_id` | nullable string | `null` | no | only for a note without a project, like `task.workspace_id` |

`Plural` gains `"notes": "note"`, which gives the REST collection and the export entry with no new handler.

Alternative: a task with a `kind: note` flag. Rejected: every task surface (Today, filters, counts, CalDAV, statistics, reminders, recurrence) would need to exclude it, and a forgotten exclusion shows notes as tasks. A separate entity is excluded by default everywhere and included only where this change says.

**D2. Scope and sharing.** `note` joins `projectChild`: with a `project_id`, a note lives in the scope its project lives in (the project's scope once shared, else the author's personal scope); without one, in the author's personal scope. `CanWrite`: owner, admin and editor write notes; a viewer reads them. First share relabels the project's notes with its tasks. A `project_id` that would move a note into another scope is refused with `scope_change`; the client moves it across scopes by copying it (new id, same document value and projection) and tombstoning the original, as it does for tasks. Deleting a shared project tombstones its notes, and the owner's device copies the non-deleted notes into the owner's personal scope without a project. A note's `labels` behave as on tasks (ids of the author's labels; ids a member does not know are kept and not shown). There is no way to share one note on its own.

**D3. The list and its order, on the device.** The page reads three sources from local tables:

- **task notes:** tasks not deleted, in a project not deleted (or no project), with a non-empty `description`; completed tasks included with a marker;
- **project notes:** projects not deleted with a non-empty `description`; archived ones with a marker;
- **standalone notes:** notes not deleted.

"Updated" is the greatest `_clock` timestamp among the note's fields: `notes_doc` and `description` for task and project notes (a task's other fields do not make its note "updated"), and `title`, `notes_doc`, `description`, `labels` and `project_id` for standalone notes. The list is sorted by it, newest first, ties by id. It shows the first 50; **Show more** adds 50 (a button, keyboard reachable, with "50 of 312" beside it), never infinite scroll. Filters (Source, Project, Label) narrow the same sorted sequence and paginate the same way; the page remembers its filters per device. The Dexie `notes` table (version 27) is indexed by `project_id`; the list is computed from the live snapshot the app already holds for tasks and projects, so no extra read per keystroke.

**D4. Search on the device.** One field searches the current list (after the filters):

- **What is searched:** the note's title (the task's title, the project's name, the standalone note's title) and its Markdown projection, decrypted on encrypted accounts (the local copy is decrypted once unlocked). The server is never asked; it cannot search encrypted text anyway.
- **Matching:** the query is split into words; a note matches when every word occurs in it as a substring, ignoring case and diacritics (Unicode NFKD, combining marks removed, `toLocaleLowerCase` of the app's language). Quoted text is matched as a phrase. Markdown syntax is stripped for matching (`**`, `_`, `#`, list markers, link targets) so `**oat** milk` matches "oat milk".
- **Index:** an in-memory map from note key to its normalised text, built lazily when the page or the palette first searches, updated from the same live-query change events the lists use, and dropped when the account locks. About 30 MB for 500 notes of 10 KB plus 2,000 task notes of 400 characters would be the raw text; normalised and deduplicated it is under 10 MB, inside the JS heap budget of `performance-10k`.
- **Ranking:** title matches first, then the number of matched words in the body, then recency.
- **Snippet:** up to about 140 characters of plain text around the first match, cut at word boundaries with "…", every matched word wrapped in `<mark>` (styled by the design token for highlights), escaped as text, never HTML from the note.
- **Pagination:** results are paginated like the list (50, Show more).
- **No dependency.** Substring search over a few megabytes runs in a few milliseconds per keystroke on a phone; `performance-10k` measures it. If typo tolerance or prefix ranking is wanted later, **MiniSearch** (about 7 KB gzip, MIT, no dependencies) is the recorded fallback; it would load with the page chunk.

**D5. Palette and filter language.**

- **Palette (`Ctrl+K`):** a **Notes** section lists standalone notes and project notes that match, with the snippet as the second line, from the same index (built on first use). A task found by its notes keeps its place among tasks and gains the snippet. Picking a note opens it (D7).
- **Filter terms:** `notes` matches tasks with a non-empty note, `no notes` tasks without, and `notes: text` (quotes allowed) tasks whose note contains the text ignoring case. They evaluate tasks only, like every filter term (standalone notes are not tasks); the Notes page has its own field. `notes` becomes a reserved word (a custom field named "Notes" is reachable by its quoted name). The Go parser accepts the same grammar so saved views validate; queries are added to the shared `formatted.txt`, and invalid ones (`notes:` with nothing after it) to the shared error vectors.

**D6. Conversions.**

- **Turn into a task** (a standalone note's menu): one batch creates a task with the note's title, the same `notes_doc` value and `description`, its `project_id` and `labels`, in the same scope (a project child either way), and tombstones the note. Undo tombstones the task and restores the note.
- **Move the note out** (a task's note menu, "Move note to a new note"): one batch creates a standalone note titled with the task's title, the same document and projection, the task's project and labels, and clears the task's note. Clearing is a **deletion inside the document** (the editor's ordinary delete of all content, a Yjs deletion) with the projection `""`, never an empty `notes_doc` value: a device that still holds the old document would otherwise merge it back and republish the text (merge and republish). Undo tombstones the new note and writes the task's earlier text back through the same fold as a history restore.
- Both use `mutateMany` with one Undo toast. A viewer is offered neither. Offline, both are local batches like any edit.
- A copied document carries the same Yjs structures; the new entity's merges are independent of the old one's from then on.

**D7. The page and the note editor.**

- `/notes`, lazy route chunk. Header: the compact tool head (title "Notes", the count "312 notes" as its lead, **New note** and Help). One row below it: the search field, then Source, Project and Label as compact menus (Combobox for project and label). That is the interface budget's two rows. On a phone: the search field in that row, the filters behind one **Filters** button opening a sheet.
- A row: the source icon (`<Icon>`: note, task, project), the title, a one-line preview (or the snippet while searching), then the project, labels and the relative updated time as metadata. Five properties at most.
- Opening: a task note opens the task in the docked panel (or page) with the note in view; a project note opens the project with its note open for editing; a standalone note opens in the docked panel on a computer (`/notes/<id>` addresses it) and as a page on a phone: a title field, the note editor (`entity: 'note'`), Project and Labels below. The editor for notes offers every command except mentions, images and "make subtask" (no members to notify, no attachments, no task).
- Keyboard: `g e` goes to Notes (free in the `go` section; registered in `web/src/lib/shortcuts.ts` with a conflict test); on the page `q` is New note (overrides the list's quick add, as the calendar views do), `/` focuses the search field (as in Settings), `j`/`k` and Enter move and open as in lists. Every control is reachable by Tab.
- Phones: rows 48 px, swipe actions none (the row menu holds Turn into task and Delete), the formatting row on focus as everywhere.

**D8. Encrypted accounts.** `title`, `description` and `notes_doc` are content (`Content: true`), so they are encrypted and the server sees ciphertext. Search, the snippets, the filter terms and the palette work on the decrypted local copy; nothing about a query leaves the device. Server features that show content (`list_notes`, `get_note`, `ot notes` without a decrypting profile) use `e2ee.Display` and say the note is encrypted, as task titles do; `ot mcp --decrypt` decrypts locally like for tasks.

**D9. Where notes travel.**

| Surface | Decision | Reason |
|---|---|---|
| Sync | In | an entity like any other |
| REST `/api/v1/notes` | In, via the generic collection routes | `Plural`; title/description writes; a REST write of `description` folds into the document on the next device that opens it (rule 3) |
| History, purge routes | In (`/api/v1/notes/{id}/history`, `/api/v1/notes/{id}/purge`) | the Trash needs them |
| JSON export and its import | In | `notes` key from `Plural`; the own-export importer maps it (device `import`) |
| CLI | In: `ot notes [--project] [--label] [--standalone] [--search text]`, `ot notes show <id>`, `ot notes add <title> [--project] [--body]` | search is local over the fetched list, like the web |
| MCP / agent tools | Read in (`list_notes` with the same filters and a text query on plaintext accounts, `get_note`); writes out | writes need the agent write gate's change sets and a review of untrusted text in notes; a later change |
| In-app assistant | Read through the same tools | follows the registry |
| CalDAV | Out | VTODO is tasks; `VJOURNAL` is barely supported by calendar apps |
| Markdown vault | Out | a note-to-file mapping is its own design (file names, folders, front matter) |
| Webhooks, activity feed, automation rules | Out | they describe task and project events; notes would need new event kinds and fixtures |
| Import from other apps | Out | none of the supported apps exports standalone notes in a usable form |
| Public pages, reminders, due dates | Out | a note is not a task |

**D10. Trash, purge, retention, compaction.** A deleted note is listed in the Trash with tasks and projects, restored with `deleted_at: null`, purged permanently through `DELETE /api/v1/notes/{id}/purge` (and Empty Trash), and purged by the retention job after `OPENTODO_TRASH_RETENTION_DAYS` like tasks; purging a project purges its notes. The purge markers and late-op rules of docs/sync.md "Purge" apply unchanged. `note.notes_doc` is in `DocFields`, so `notes-compaction` deletes its superseded documents and thins its `description` revisions like a task's, and history leaves the document out.

**D11. Languages.** Every string in the six catalogs (en, de, fr, it, es, pt). The search's normalisation uses the app's language for case folding; the empty state, the count and "Untitled note" are translated.

## Data model impact

- One additive entity `note` (fields in D1), in `DocFields` and `Plural`; `title`, `description`, `notes_doc` content. Regenerated `opSchema.ts`, `contentfields.go`, the contract fixture.
- No migration of existing data; `scope_fields` holds fields generically. A store migration is not needed; history and purge read the existing tables.
- Dexie version 27 adds `notes: 'id, project_id'` (local only). Re-seed after a restore and the refusal handling cover the new kind (`offline-first-sync` "Every entity kind is re-seeded and handled when refused").
- No op field renamed or removed.

## Size and memory

No new dependency. The Notes page, its index and the note panel are a lazy chunk (estimated 12 KB gzip). First load grows by about 1.5 KB gzip: the route entry, the sidebar item, the palette's Notes section and the three filter keywords; `web/bundle-budget.json` is raised only if the measured value needs it, with the reason in the pull request. The search index costs under 10 MB of heap at the `performance-10k` notes fixture and is dropped on lock. Server binary growth negligible; runtime memory unchanged (no server-side index).

## Interface budget

- **Chrome rows:** the page has the tool head and one row (search and filters): 2.
- **Properties per row:** at most 5 (source, title, preview or snippet, project and labels, updated).
- **Sidebar destinations:** none added; Notes is in the More group, promotable like Focus, and the six-destination limit holds when promoted (Open Loops first keeps it in More).
- **Scroll regions:** the list only (plus the docked panel's own scroller): within 3.
- **Shortcuts:** `g e` (go), `q` and `/` on the page (view-scoped overrides), all in the registry with the conflict test.

## Open questions

- **Shortcut `g e`.** Default chosen: `g e` (`g n` is Anytime). The owner may prefer another letter.
- **MCP write tools for notes** (create, append). Default chosen: out of this change; read tools only.
- **Primary destination.** Default chosen: Notes sits in More, promotable. The owner may want it promoted by default in Lists and Companion modes.
- **Vault and CalDAV.** Default chosen: out. A `notes-vault` change could map standalone notes to Markdown files.
