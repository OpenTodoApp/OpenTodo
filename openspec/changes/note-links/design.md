# Design

## Context

- Notes are a Yjs document (`notes_doc`) and its Markdown projection (`description`), written as a pair on tasks, projects and standalone notes (`rich-text-editing`, `standalone-notes`). Text blocks hold one `XmlText` whose formatting attributes are marks; the known marks are `link {href}`, `strong`, `em`, `strike`, `code` and `mention {id, name}` (`web/src/lib/richtext.ts`). Unknown marks and elements are kept by every merge.
- What a 1.0 client does, read from `v1.0.0:web/src/lib/richtext.ts` and `richtextEditor.ts`: it reads only the known marks; an unknown mark is dropped from its display model, so its text shows as plain text, and an unknown *inline embed* (a non-string insert in the `XmlText`) is skipped, so its text would disappear. A `link` mark with any non-empty `href` is kept, displayed and projected as `[text](href)`; the editor renders it as an anchor with an `href` only for `http(s)`/`mailto` and `?task=<id>`. The Markdown reader (`markdown.ts`) turns `[x](?task=<id>)` into a task link and shows any other relative link as its text.
- **Make subtask** (`editor-everywhere` D6) already writes a link `[title](?task=<id>)` into the parent's note. `Shell.tsx` opens `?task=<id>` from any page.
- Mentions are a mark over the text `@name` plus a plaintext id list `task.note_mentions` the server filters and notifies on.
- The Notes page keeps an in-memory search index over the decrypted projections, warmed in 8 ms slices (`web/src/app/notes/NotesPage.tsx`, `web/src/lib/noteList.ts`). Task lists follow the rows a write changed (`web/src/lib/taskDelta.ts`, `incremental-list-updates`).
- The 10,000-task account has 2,000 task notes (median 400 characters); the notes fixture adds 500 notes of about 10 KB (`docs/performance.md`). Budgets that bound this change: `notes-page` 400 ms desktop / 1,200 ms phone, `notes-search` 50 / 150 ms, `notes-js-heap` 170 MB, `server-mcp-search` 200 ms.
- Own-export import keeps entity ids (`internal/importer/plan_own.go`), so id-based links survive a round trip.

## Goals / Non-Goals

**Goals:** links that survive renames, offline edits, encryption and 1.0 clients without a format change; backlinks that cost nothing on the server and stay inside the existing budgets; a link form scripts and agents can write as plain Markdown.

**Non-Goals:** link aliases, block or heading links, unlinked mentions, links in comments, a server-side link table or link search, a link-aware vault or CalDAV mapping.

## Decisions

**D1. A link is the existing `link` mark with an in-app address.** The stored form is a run of text (the target's title when the link was written or last refreshed) carrying `link: {href: "?note=<id>"}`, `?task=<id>` or `?project=<id>`; ids are `[A-Za-z0-9_-]+`.

| Reader | What it gets |
|---|---|
| This build's editor | an inline link chip with the target's current title (D2) |
| 1.0 editor | the text, formatted as a link; `?task=` links open the task (as Make subtask's do today), `?note=` and `?project=` read as text; editing the note keeps the mark |
| Projection (`description`), REST, export, history, webhooks | `[Trip](?note=8f2c…)`, produced by 1.0 and this build alike |
| Fold-back of a plain-text write | `[Trip](?note=8f2c…)` parses back into the same link (existing parser) |
| CalDAV, Markdown vault | the projection unchanged; a calendar app shows the Markdown text, and its edit folds back with the link intact |
| CLI, MCP | the projection, plus resolved `links` / `linked_from` where D6 allows |

Alternatives considered:
- *A new mark `ref {kind, id}`.* 1.0 would drop it from its display and its projection, so a 1.0 device editing the note would publish a `description` without the link, and plain-text readers would never see links. Rejected.
- *An inline atom node (embed) in the document.* 1.0 skips non-string inserts: the link's text would vanish on 1.0 devices and from their projection. Rejected.
- *A wiki syntax in the text (`[[Trip]]`).* Title-based, so a rename breaks it, and two notes with one title are ambiguous. Rejected; `[[` stays the typing trigger only.
- *An absolute path (`/notes/<id>`).* Works the same, but `?task=` is already the established form, the shell handles query parameters on every page, and one shape (`?<kind>=<id>`) keeps the grammar to one regular expression.

**D2. Rename-safe display: the stored text is a cached label.** In this build every internal link reads as the target's current title (task title, project name, note title or "Untitled note"), wherever it is rendered: the editor shows it as an inline atom node (`ref`, editor-only, never stored) whose node view draws the live title; `Markdown.tsx` and previews substitute the title too. Mapping: document → editor turns each maximal run with one internal `href` into one `ref` node remembering its stored label; editor → document turns it back into a run carrying the link mark. When the user edits the note, the minimal-update diff writes the current title as the label of a `ref` whose label is stale, so the projection catches up without any write on open; a viewer never writes. Concurrent refreshes of the same label on two devices can merge into a doubled label ("HolidayHoliday"); the display is unaffected (one run, one link) and the next edit rewrites the label once. Custom link text is not offered: an internal link always reads as its target. Alternative: refresh every stale label when a note is opened. Rejected: it writes ops on read, conflicts with viewers, and wakes every device after each rename.

**D3. Writing a link.** `[[` (after a space or at the start of a block, as `@`) opens the picker in the editor's suggestion slot (`editorSuggest.ts` gains the trigger); **Link to…** in the `/` menu inserts `[[` and opens it. The picker lists, for the typed text, live notes, tasks (open first, completed after) and projects (archived after) of the current workspace, matched like the Notes search (every word, ignoring case and accents) over titles only, ranked: prefix of the title, then word matches, then most recent change; at most 8 rows, each with its kind icon and project. With text typed and no exact title match, the last row is **New note "<text>"**: one batch creates a standalone note titled with the text, in the source's project (none for a personal source), and inserts the link. Arrow keys move, Enter inserts, Escape closes and keeps `[[text` as typed. Inside a note of a shared project the picker offers only items of that project (open question 1). The node is atomic: Backspace after it removes the whole link; the caret never enters it. Read-only editors (viewers) do not open the picker.

**D4. Broken and unreachable links.** Resolution looks up the id in the device's local tables. A target that is missing (purged, never synced to this account), deleted (in the Trash) or outside the user's scopes renders the stored label in the muted tone, not as a link, with no action; the three cases look the same, so a link reveals nothing about an item the reader cannot see beyond the label its author wrote. A restored target becomes a link again (ids do not change). Across workspaces: the picker offers the current workspace only; a link to another workspace's item (pasted, or written by a script) resolves and opens it the way `?task=` addresses already open a task from any page. Linked references list sources from every workspace the device holds, each with its workspace's name when it differs from the current one. Members of a shared project see a link from a shared note to the author's personal note as muted text; the backlink is not shown to them either, because they cannot read its source. Privacy follows: the label is text the author wrote into a shared note, the same as typing the title by hand.

**D5. The link index on the device.** A lazy module (`web/src/lib/noteLinks.ts`, loaded with the editor's chunk, about 2 KB gzip) holds:
- `linksIn(markdown)`: the internal links of a projection, one regular expression behind an `indexOf("](?")` gate, skipping code spans and fenced blocks; the same grammar in Go (`internal/notelinks`) is pinned by shared vectors (`internal/notelinks/testdata/links.vectors.json`, listed in `docs/contracts.md`).
- The index: for every source (task note, project note, standalone note, keyed `<kind>:<id>`, including its pending appends) its outgoing targets, and the reverse map target → sources.
- **Source text** is the decrypted projection the device already holds, never the document: no Yjs decode, works on encrypted accounts once unlocked, and offline.
- **Build:** on the first open of a note, a task page with a note, or a project note, the index is built in 8 ms slices on the main thread (as the Notes search warms). Cost on the notes fixture: about 6 MB of text (2,000 task notes of ~400 characters, 500 notes of ~10 KB, 60 projects); the `indexOf` gate skips rows without links, so the build is a scan of about 6 MB: about 10 ms on the CI desktop, about 40 ms in the phone profile, sliced so no task exceeds the 200 ms long-task limit. Memory: a few thousand edges and keys, under 1 MB, far inside `notes-js-heap`. Dropped on lock, with the search index.
- **Incremental update:** tasks follow `taskDelta` (the rows a write changed, before and after); a row whose `description` and appends are unchanged is skipped, a changed one is re-parsed and its edges replaced. Projects and notes are small lists: the index compares each row's `description` clock with the one it indexed. When a change cannot be followed (the chain is cut, more than 1,000 rows), the index rebuilds in slices, giving the same value. An edit in an open note updates only that source (one parse of one projection).
- **Budget:** a new nightly metric `note-references`: open a note of the notes fixture with linked references, index not yet built, to its Linked references painted: 200 ms desktop, 600 ms phone profile. The perfseed notes fixture gains links (each standalone note links to two notes and one task; 200 task notes link to a note).

Alternatives: a plaintext id list per note (`note.links`, like `note_mentions`): the server could answer backlinks cheaply, but it would reveal the link graph of encrypted accounts, and every plain-text writer (REST, CLI, MCP, a 1.0 device) would have to keep it in step with the text. Rejected. Scanning the documents instead of the projections: needs Yjs for every note at index time. Rejected.

**D6. What the server, MCP and the CLI offer.** No table, no route.
- **MCP, unencrypted account:** `get_note` and `get_task` gain `links` (the targets of the item's own text: `kind`, `id`, `title`, `available`) and `linked_from` (sources the caller can read: `kind`, `id`, `title`), computed in the call's memory over the rows of the caller's scopes with `internal/notelinks` (the snapshot the note tools already load), titles inside `untrusted_text`; inside the `server-mcp-search` budget (the same pass `search_notes` makes). The write tools' descriptions say that `[title](?note=<id>)`, `?task=` and `?project=` make links.
- **MCP, encrypted account:** neither field is returned (the server holds only ciphertext; `e2ee.Display` placeholders as today). `ot mcp --decrypt` and an opted-in device do not compute them (a backlink needs every note), and the tool description points to `ot notes links`.
- **CLI:** `ot notes links <ref>` (`--json`) fetches the note lists `ot notes list` already uses and computes outgoing links and linked references on the user's machine, so an unlocked encrypted profile works and a locked one stops with `encryption_enabled` (exit 5) as other text reads. `ot notes show` is unchanged.
- **REST:** unchanged. `GET /api/v1/tasks/{id}` keeps its 10 ms budget.

**D7. Addresses.** The shell opens `?note=<id>` (the note, docked or as a page) and `?project=<id>` (the project) from any page, as it opens `?task=<id>`, and removes the parameter from the address. Ctrl/Cmd-click in the editor and a click in rendered Markdown open internal links in place (an in-app navigation), not in a new tab.

## Data model impact

None. No new entity, field or op kind; links are text with an existing mark. No migration; existing `?task=` links from Make subtask become chips with live titles and count as linked references.

## Size and memory

No dependency. Editor chunk (lazy) grows by about 4 KB gzip (node, picker, index); first load grows by under 0.5 KB (the address handling), within `web/bundle-budget.json`. Server binary: `internal/notelinks` is a few hundred lines of standard library. Runtime memory: under 1 MB on the device; the server holds nothing between calls.

## Interface budget

- **Chrome rows:** unchanged; Linked references is content at the end of a note, below a task's notes, or one folded line in a project's note area, never above a list.
- **Task properties:** unchanged (the section is not a property and is hidden when empty).
- **Sidebar destinations:** none added.
- **Scroll regions:** none added; the section scrolls with its panel or page.
- **Shortcuts:** none added; `[[` is a typed trigger inside the editor, like `@` and `/`.

## Risks / Trade-offs

- [A 1.0 device shows `?note=` links as plain text] → accepted: readable, kept through its edits; `?task=` links already work there.
- [Doubled label after concurrent refreshes] → display unaffected; fixed by the next edit; a vector pins the display of a doubled run.
- [Projection noise in calendar apps and the vault (`[Trip](?note=…)`)] → the same form Make subtask writes today; stripping it would lose the link on the way back.
- [Index build on a phone with a very large account] → sliced; if `note-references` misses its phone budget, the index can be persisted per device in IndexedDB, keyed by row clocks, rather than raising the budget.

## Migration Plan

Additive. Ship behind nothing: older builds read links as text. Rollback leaves links in notes as ordinary link formatting.

## Owner decisions (2026-11-09)

The owner took the recommendation on each open question below.

### The questions as asked

1. **The picker inside a shared project's note.** Recommendation: offer only items of that project, so a member never meets a muted link to something private and an author does not leak a private title by accident; other links can still be pasted. The alternative is the whole workspace with the muted-link fallback.
2. **Links in comments.** Recommendation: not in this change. Comments are a conversation, not a reference, and counting them would make Linked references noisy and double the index sources; revisit if people ask for it.
3. **Server-side `linked_from` for unencrypted accounts.** Recommendation: yes, in MCP `get_note` and `get_task` only (assistants benefit most, and it costs nothing stored), not in REST, so the REST read budgets stay untouched.
