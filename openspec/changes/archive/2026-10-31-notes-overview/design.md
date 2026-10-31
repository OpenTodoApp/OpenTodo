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

**D8. Encrypted accounts.** `title`, `description` and `notes_doc` are content (`Content: true`), so they are encrypted and the server sees ciphertext. Search, the snippets, the filter terms and the palette work on the decrypted local copy; nothing about a query leaves the device. Server features that show content (the note tools, the `opentodo://notes` resources, `ot notes` and `ot task note` without an unlocked profile) use `e2ee.Display` and say the note is encrypted, as task titles do. The CLI and MCP on encrypted accounts are in D13.

**D9. Where notes travel.**

| Surface | Decision | Reason |
|---|---|---|
| Sync | In | an entity like any other |
| REST `/api/v1/notes` | In, via the generic collection routes | `Plural`; title/description writes; a REST write of `description` folds into the document on the next device that opens it (rule 3) |
| History, purge routes | In (`/api/v1/notes/{id}/history`, `/api/v1/notes/{id}/purge`) | the Trash needs them |
| JSON export and its import | In | `notes` key from `Plural`; the own-export importer maps it (device `import`) |
| CLI | In, reads and writes: `ot notes list\|search\|show\|add\|edit\|append\|rm\|to-task` and `ot task note <ref>` (D12) | owner decision 2026-10-31: notes fully exposed in the CLI; writes through the REST routes |
| MCP / agent tools | In, reads and writes: `list_notes`, `search_notes`, `get_note`, the resources `opentodo://notes` and `opentodo://notes/{id}`; `create_note`, `update_note`, `append_to_note`, `trash_note`, `note_to_task` behind the agent write gate (D12) | owner decision 2026-10-31: notes fully exposed in MCP |
| In-app assistant | Reads and proposed writes through the same tools | follows the registry; the browser applies the confirmed part |
| CalDAV | Out | VTODO is tasks; `VJOURNAL` is barely supported by calendar apps |
| Markdown vault | Out | a note-to-file mapping is its own design (file names, folders, front matter) |
| Webhooks, activity feed, automation rules | Out | they describe task and project events; notes would need new event kinds and fixtures |
| Import from other apps | Out | none of the supported apps exports standalone notes in a usable form |
| Public pages, reminders, due dates | Out | a note is not a task |

**D10. Trash, purge, retention, compaction.** A deleted note is listed in the Trash with tasks and projects, restored with `deleted_at: null`, purged permanently through `DELETE /api/v1/notes/{id}/purge` (and Empty Trash), and purged by the retention job after `OPENTODO_TRASH_RETENTION_DAYS` like tasks; purging a project purges its notes. The purge markers and late-op rules of docs/sync.md "Purge" apply unchanged. `note.notes_doc` is in `DocFields`, so `notes-compaction` deletes its superseded documents and thins its `description` revisions like a task's, and history leaves the document out.

**D11. Languages.** Every string in the six catalogs (en, de, fr, it, es, pt). The search's normalisation uses the app's language for case folding; the empty state, the count and "Untitled note" are translated.

**D12. Notes in the CLI and MCP.** Owner decision 2026-10-31: notes are fully exposed in the CLI and in MCP, reads and writes. Earlier drafts of this change kept MCP read-only; that question is closed.

- **REST routes the CLI writes through.** The generic collection routes (`/api/v1/notes`, `PATCH /api/v1/tasks/{id}`) plus three routes registered through `routes.handle` with `signedIn` (read tokens refused as on every write; agent tokens refused, they write through MCP): `POST /api/v1/notes/{id}/append` and `POST /api/v1/tasks/{id}/note/append` (body `{"id"?, "text"}`, 201 with the append id, D13), and `POST /api/v1/notes/{id}/to-task` (one batch: creates the task with the note's `title`, `notes_doc`, `description`, `project_id` and `labels`, tombstones the note, 201 with the task; on an encrypted account the body carries the values sealed for the new task id, D13). `GET` of a task, project or note returns `body_version` (D13), and of a task or note its pending appends under `appends`; `PATCH` of any of the three honours `If-Match` when it writes `description`. Every write uses `ApplyStrict` and `NotifyApplied` with the token's device, as other REST writes. No `.demoDenied()`: these are single-entity content writes, like `PATCH`.
- **CLI** (`internal/cli/cmd_notes.go`): table output and `--json` with a `note` schema in `ot schema`, completion, `--dry-run` on every write, `--read-only` refusing them, references by id or an unambiguous title prefix as for tasks:

| Command | Does | Request |
|---|---|---|
| `ot notes list` (also bare `ot notes`) `[--source note\|task\|project\|all] [--standalone] [--project] [--label] [--search text] [--limit]` | lists notes newest first (D3's sources and order) | the collection routes; search is local over what they returned |
| `ot notes search <text>` | `list --search`, ranked as D4 (title matches first) | same |
| `ot notes show <ref>` | prints the Markdown: the projection, then pending appends | `GET /api/v1/notes/{id}` |
| `ot notes add <title> [--project] [--label]... [--body text \| --body-file path\|-] [--idempotency-key]` | creates a note | `POST /api/v1/notes` with `description` |
| `ot notes edit <ref> [--title] [--project] [--label]... [--body \| --body-file]` | changes fields; a body is a replacement with the version check | `PATCH /api/v1/notes/{id}` with `If-Match` |
| `ot notes append <ref> <text> \| --body-file` | adds text at the end without replacing | `POST …/append` |
| `ot notes rm <ref>... [--yes]` | to the Trash, with the `--yes` rules of `ot rm` | `DELETE /api/v1/notes/{id}` |
| `ot notes to-task <ref>` | turns the note into a task (D6), prints the task id | `POST …/to-task` |
| `ot task note <ref> [--set text \| --file path\|- \| --append text \| --clear]` | prints, replaces, appends to or clears a task's note as Markdown | `GET`/`PATCH /api/v1/tasks/{id}` with `If-Match`, `POST …/note/append` |

`ot task note` is the first command of a `task` group; the existing top-level task commands are unchanged. `--clear` is a replacement with `""` (rule 3 deletes the old body's content, so an older copy cannot bring it back).
- **MCP / agent tools** (`internal/agenttools/read_notes.go`, `write_notes.go`; transport unchanged):
  - Reads (behind `mcp.enabled`, any token MCP accepts): `list_notes` (`source`, `project_id`, `label_id`, `limit`, cursor; newest first), `search_notes` (`query` and the same filters; D4's matching and ranking in the server's memory over the rows of the call, nothing stored), `get_note` (`id`: title, Markdown `text`, `appended` (pending appends, oldest first), project, labels, `body_version`, `updated_at`). Resources `opentodo://notes` (the 50 newest standalone notes, as `list_notes`) and `opentodo://notes/{id}` (as `get_note`). Every title, text, snippet and append is inside `untrusted_text`.
  - Writes, only when the write gate passes (owner `mcp.writes`, the user's "Allow AI assistants to make changes", an `agent` token; otherwise omitted from `tools/list` and refused with the existing codes): `create_note` (`title`, `description`, `project_id`, `label_ids`, optional `id`), `update_note` (`id` and any of `title`, `project_id`, `label_ids`, `description`; `description` requires `base_version` from `get_note`), `append_to_note` (`note_id` or `task_id`, `text`, optional `append_id`), `trash_note` (`ids`; only notes created with the same token, like `trash_tasks`, else `not_permitted`), `note_to_task` (`id`). Each plans a change set and applies it with `ApplyStrict` under device `agent:<token-id>`, counts against the write limits (one entity per note, `note_to_task` two), is audited as `agent.write` with the tool name and counts (never the text), and is labelled in history and undoable like every agent write. Titles and text are validated as task titles and descriptions (20,000 characters for a body or an append).
  - The in-app assistant uses the same tools; it plans writes and the browser applies the confirmed part through `mutateMany` with device `assistant:<device-id>`. An append confirmed there is a direct document insertion (the browser holds the document), not an `appends` op.

**D13. Plain-text writes of a note: replace and append.** The server never decodes a document, so every text write from the CLI or MCP is Markdown that devices fold into `notes_doc`:

- **Replace** (`ot notes edit --body`, `ot task note --set` and `--clear`, `update_note` with `description`, a `PATCH` of `description`) writes only `description`. It becomes the document by the existing fold-back (docs/sync.md "Mergeable documents" rule 3): the first device that opens the note, or republishes it, sees a `description` clock newer than `notes_doc` with no document carrying that clock, parses the text as Markdown into a new body named after the clock with the client id derived from that name, deletes the older bodies' content and publishes the pair; devices that fold the same write produce identical structures and merge into one. Rule 3 overrides a concurrent rich edit made before the write once. To limit that to edits not yet on the server, a replace carries a **version check**: `body_version` is the greatest clock among `description`, `notes_doc` and the `appends` keys, as a string; a `PATCH` writing `description` with `If-Match: "<body_version>"` is refused 409 `body_changed` (with the current version) when the stored version differs, checked inside the `ApplyStrict` transaction. The CLI always sends the version it read; `update_note` refuses a `description` without `base_version` (`invalid_input`) or with a stale one (`body_changed`). A `PATCH` without `If-Match` keeps today's behaviour for scripts.
- **Append** (`ot notes append`, `ot task note --append`, `append_to_note`) never writes `description` or `notes_doc`, so rule 3 is not triggered and nothing is replaced. It writes one key of a new family `appends.<append-id>` on `task` and `note` (declared like `fields.<id>`; content, so encrypted; the value is the Markdown text). A new rule 5 of "Mergeable documents":
  - a non-empty `appends.<id>` is **pending**. A device that holds the note, when it applies the op and before any local write of the pair, inserts the text parsed as Markdown as blocks at the end of the visible body, every inserted block carrying the attribute `append: <id>` (an unknown attribute to older readers, kept by every merge), and publishes the pair with `appends.<id>` set to `""` in the same batch. Being a Yjs insertion, it merges with concurrent rich edits on every device instead of replacing them;
  - a device does not fold an append whose `append: <id>` block is already in its merged document;
  - two devices that fold the same append concurrently insert two copies; after every merge, when more than one block carries the same `append` id, each device keeps the copy whose first block has the smallest Yjs item id (client id, then clock) and deletes the blocks of the others, so all devices converge on one copy without another round;
  - the server and the plain-text readers (REST `GET`, the export, MCP, `ot`) show a note's text as `description` followed by its pending appends in clock order, a blank line between, so an append is readable at once, before any device folded it;
  - receipt rules (`internal/sync`): the key is 1–64 of `[A-Za-z0-9_-]`; a non-empty value is accepted only when the key has none yet (an append is written once and never edited), `""` from anyone who may write the entity; at most 100 pending appends per entity (`too_many_appends`), and the projection plus pending appends at most 64 KB (`invalid_input`; by envelope length on ciphertext). A fold that would make the document exceed 256 KB is not done: the append stays pending and the note shows "This note is full";
  - offline: an append made in the web app is a direct insertion, never an `appends` op; an `appends` op reaching an offline device is folded when it syncs, and the deduplication covers devices that folded while apart. History and activity leave `appends.*` out (the folded `description` is the readable revision), webhooks and CalDAV ignore it, compaction drops `""` values that are superseded;
  - an older client that does not know the family ignores the op; the text stays pending and readable through the server until a device that knows the rule folds it.
- **Encrypted accounts**, following the existing tools:
  - **CLI:** with a profile unlocked by `ot encryption unlock`, `ot notes` and `ot task note` decrypt and encrypt on the user's machine with `internal/e2ee/crypt`, as `ot vault` does (title, `description` and each `appends.<id>` sealed for their entity, id and field; `to-task` seals the note's title, description and document for the new task id it chose). Without the key, reads show "encrypted" and text writes stop with `encryption_enabled` (exit 5); `rm` and project or label changes within the same scope still work.
  - **MCP without an opted-in device:** reads return the placeholder; `create_note`, `update_note` and `append_to_note` describe their text arguments as ciphertext only (`CiphertextOnlyNote`) and refuse plaintext with `encryption_enabled`; envelopes are stored as given; `trash_note` and project and label changes work; `search_notes` and `note_to_task` return `encryption_enabled` (the server can neither read nor reseal text). `ot mcp --decrypt` adds the note tools to its attribution table (`create_note`: title and description with a chosen id; `update_note`: title and description; `append_to_note`: text, with a chosen `append_id`, field `appends.<append-id>`), decrypts `list_notes`, `get_note` and the note resources like task results, answers `search_notes` itself by calling `list_notes` and matching the decrypted rows on the user's machine, and refuses `note_to_task` with a message pointing to `ot notes to-task`.
  - **MCP with an opted-in device** (device relay): as for tasks, read values are decrypted through the device (only those in the result) and planned content values (title, description, the append) are encrypted through it before Apply; `note_to_task` asks the device to decrypt the note's three values and encrypt them for the new task, in the call's memory only; `search_notes` returns `encryption_enabled` (it would send every note through the device), pointing to `ot mcp --decrypt` or the app.

## Data model impact

- One additive entity `note` (fields in D1), in `DocFields` and `Plural`; `title`, `description`, `notes_doc` content. Regenerated `opSchema.ts`, `contentfields.go`, the contract fixture.
- One additive field family `appends.<id>` on `task` and `note` (string, default `""`, content), D13, and rule 5 in docs/sync.md "Mergeable documents". No existing field changes meaning.
- No migration of existing data; `scope_fields` holds fields generically. A store migration is not needed; history and purge read the existing tables.
- Dexie version 27 adds `notes: 'id, project_id'` (local only). Re-seed after a restore and the refusal handling cover the new kind (`offline-first-sync` "Every entity kind is re-seeded and handled when refused").
- No op field renamed or removed.

## Size and memory

No new dependency. The CLI's and the agent tools' note search use a Go port of D4's matcher (`internal/notesearch`, standard library only, pinned by shared vectors with `web/src/lib/notes.ts`). The Notes page, its index and the note panel are a lazy chunk (estimated 12 KB gzip). First load grows by about 1.5 KB gzip: the route entry, the sidebar item, the palette's Notes section and the three filter keywords; `web/bundle-budget.json` is raised only if the measured value needs it, with the reason in the pull request. The search index costs under 10 MB of heap at the `performance-10k` notes fixture and is dropped on lock. Server binary growth negligible; runtime memory unchanged (no server-side index).

## Interface budget

- **Chrome rows:** the page has the tool head and one row (search and filters): 2.
- **Properties per row:** at most 5 (source, title, preview or snippet, project and labels, updated).
- **Sidebar destinations:** none added; Notes is in the More group, promotable like Focus, and the six-destination limit holds when promoted (Open Loops first keeps it in More).
- **Scroll regions:** the list only (plus the docked panel's own scroller): within 3.
- **Shortcuts:** `g e` (go), `q` and `/` on the page (view-scoped overrides), all in the registry with the conflict test.

## Open questions

- **Shortcut `g e`.** Default chosen: `g e` (`g n` is Anytime). The owner may prefer another letter.
- **Primary destination.** Default chosen: Notes sits in More, promotable. The owner may want it promoted by default in Lists and Companion modes.
- **Vault and CalDAV.** Default chosen: out. A `notes-vault` change could map standalone notes to Markdown files.
