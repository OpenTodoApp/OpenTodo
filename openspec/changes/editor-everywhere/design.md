# Design

## Context

See proposal.md for motivation. Relevant current state:

- Notes are a Yjs document in `notes_doc` with a Markdown projection in `description` (`rich-text-editing`). The editor core (`web/src/lib/richtextEditor.ts`, 415 lines) builds a ProseMirror schema of paragraph, heading, bullet, ordered and check lists, hard break, and the marks link, strong, em, strike and code; a neutral model (`web/src/lib/richtext.ts`: `RNode`, `Run`, `Marks`) sits between the editor and the Yjs body, with `renderMarkdown` and `parseMarkdown` on that model. `NotesEditor.tsx` is loaded with `React.lazy`, so ProseMirror and Yjs are one chunk fetched when a note first opens.
- Comments are Markdown strings (`comment.body`, at most 64 KB), rendered by `web/src/lib/markdown.ts` and `web/src/app/Markdown.tsx` (paragraphs, emphasis, inline code, code blocks, links, lists, block quotes; raw HTML is text). The composer (`task-detail/Composer.tsx`) is a text area with `@` completion from the cached members, a per-task session draft, and attach, submit and the key hint when expanded (web-app "Task panel comment composer").
- Mentions on comments are an id list the server filters to current members at receipt (`internal/sync/comments.go`) and fans out through `notify.MentionSink`. Tasks have no mention field.
- Attachments: metadata in ops, bytes under the data directory, image thumbnails already rendered from a blob (`AttachmentsRow.tsx`), which for an encrypted account is decrypted on the device. Paste and drop anywhere on the panel attach a file.
- The op schema has one field family already, `fields.<id>` (custom-fields), validated by prefix; per-field LWW otherwise.
- `internal/activity` derives events from ops and must match `web/src/lib/activity.ts` through a shared fixture.
- Open changes touching the same requirements, expected to archive before this one is applied: `task-pages` modifies comments "Comment entity" (guest name and page id) and activity-log "Public link operations form their own events"; `time-tracking` modifies web-app "Task panel tabs". The MODIFIED texts here are written against those archived texts (the "Comment entity" delta includes the guest fields) and say so.

## Goals / Non-Goals

**Goals:**
- One editing experience for notes and comments, with comments unchanged on the wire.
- Every new feature usable offline, convergent, and reachable without a mouse.
- No growth of the main bundle beyond glue; everything heavy stays in the lazy editor chunk.
- Reactions that never lose a concurrent reaction and reveal nothing to the server beyond "who reacted how".

**Non-Goals:**
- Real-time co-editing of a comment, or a Yjs document per comment (a comment has one author; the storage stays a string).
- A general HTML or Markdown import of arbitrary documents; the subset is fixed and documented.
- Fetching anything from a URL typed into a note.

## Decisions

**D1. Comments keep Markdown; the editor is a view over it.** The expanded composer mounts the editor on a document parsed from the Markdown body with `parseMarkdown` of `richtext.ts` (extended by D3), and sends `renderMarkdown` of the editor's model. The round-trip subset is the table below; text outside it (raw HTML, unknown constructs) is kept as literal text runs so editing a comment never destroys what the writer typed. Alternatives: (a) store `comment.body_doc` as a Yjs document like notes. Rejected: a comment has one author and a 64 KB cap, the API, CLI, MCP, email digest and webhooks all read Markdown, and a second storage form would double every consumer. (b) Keep the text area and add toolbar buttons that insert Markdown syntax. Rejected: two editors to maintain, no tables or images, and the inconsistency the proposal names.

| Markdown | Editor node or mark | Round-trip |
| --- | --- | --- |
| paragraphs, `# ` to `###### ` headings | paragraph, heading | exact |
| `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` | strong, em, strike, code | exact (emphasis normalised to `*` and `**`) |
| `[text](https://…)`, `mailto:` | link | exact; unsafe schemes rendered as text |
| `- `, `1. `, `- [ ] `, `- [x] ` lists, nested by two spaces | bullet_list, ordered_list, list_item (checked) | exact |
| `> ` block quotes | blockquote | exact |
| fenced code blocks ```` ``` ```` with optional language | code_block (attr `lang`) | exact |
| pipe tables with a `---` separator row | table, table_row, table_cell, table_header | exact up to 10 × 100; alignment markers kept as attrs |
| `![alt](attachment:<id>)` | image (attrs `id`, `alt`) | exact; any other image URL is kept as a link to the URL |
| `@name` matching a member token | mention (attrs `id`, `name`) | exact while the member exists; otherwise plain text |
| two trailing spaces or `\` before a newline | hard_break | exact |
| raw HTML, footnotes, headings above level 6, anything else | text | kept verbatim as text |

**D2. Lazy loading keeps the main bundle flat.** The resting composer line is a button-like line that does not need the editor; focusing it, a draft, a reply target or `Shift+C` mounts the editor chunk through the same `React.lazy` as the notes. Until the chunk arrives the line shows a short "Loading" state and keeps the typed text in a plain field, so a slow first load loses nothing. The reaction bar and the Markdown renderer additions (tables, images, mentions) are in the main bundle: estimated 1.5 KB and 1 KB gzipped. Editor chunk growth, estimated and to be measured in task 7.3: tables 14 KB (`prosemirror-tables`), slash menu 2 KB, images and mentions 3 KB, quote and code block 1 KB, toolbar 2 KB, comment round-trip glue 2 KB; about 25 KB gzipped in total, loaded on first use only. The binary and image grow by the raw size of those chunks, about 90 KB.

**D3. One schema, one model.** New nodes (`blockquote`, `code_block`, `table`, `table_row`, `table_cell`, `table_header`, `image`) and one mark (`mention`) are added to the ProseMirror schema and to the neutral model; `toModel`, `updateBody`, `renderMarkdown` and `parseMarkdown` learn them once and both the notes and the comments use them. Yjs bodies written by this version carry the new element names; an older client keeps them through the merge, as "Compatibility with plain-text clients" requires, because `updateBody` leaves unknown nodes alone. Tables use `prosemirror-tables` (MIT, about 14 KB gzipped) for cell selection, Tab navigation and row and column commands. Alternative: hand-written table nodes without the package. Rejected: cell selection, column resizing guards and the Tab keymap are the hard part and the package is small and widely used.

**D4. Plain-text projection of tables, images and mentions.** A table projects to a pipe table (cells' inline runs on one line, `|` escaped as `\|`); an image to `![alt](attachment:<id>)`; a mention to `@name`. Limits: 10 columns, 100 rows, a cell of inline content only (no lists or blocks in cells), checked in the editor so no op is produced beyond the limits; the server validates nothing new, `notes_doc` stays an encoded document and `description` a string within the existing caps. Alternative: projecting a table as a bullet list per row. Rejected: a pipe table is readable text, is what `ot` and the API clients expect from Markdown, and reparses exactly.

**D5. Images are attachments.** Dropping, pasting or choosing an image in the editor creates an attachment through the existing attach path (metadata op, queued upload) and inserts an `image` node naming its id. Rendering resolves the id to the task's attachment: available, the bytes come from the authenticated content route as an `<img>` (plaintext account) or from the decrypted blob the thumbnails already produce (encrypted account), so encrypted accounts are supported in v1 without new crypto; uploading, waiting or missing attachments show a placeholder with the file name and state; a removed attachment shows a "removed image" placeholder that can be deleted from the text. The image node carries no bytes, so document size is unchanged. Removing an attachment that a note embeds asks the user first, naming the note. An image URL typed or pasted from the web becomes a link, never an embed: the app loads nothing from third parties.

**D6. Make subtask.** On a check-list line the slash menu, the line's context menu and `Ctrl`/`⌘`+`Shift+Enter` offer Make subtask: one `mutateMany` creates the subtask (parent id, project inherited, checked state as completion) and rewrites the note so the line becomes a paragraph with a link to the task's own address (`?task=<id>`); the Markdown projection is `[title](?task=<id>)`; the renderer shows the link with the task's current title and done state when the task is on the device, and the stored text otherwise. Undo reverts both in one step. Alternative: a `task_ref` node type. Rejected: a link needs no new node, survives every older client and reads fine in the API.

**D7. Mentions in notes.** A `mention` mark with the member's id and name; completion from the same member cache as comments. The client writes `task.note_mentions` (additive `kIDList`, default empty, plaintext) in the same mutation as `notes_doc`, computed from the document. The server filters the list to current members of the task's shared project at receipt (reusing the comment rule), drops it to empty on a personal task, and notifies accounts newly added through `MentionSink` with `source: "note"`, so the inbox entry reads "mentioned you in the notes of". Alternative: deriving mentions on the server from the projection text. Rejected: the server cannot read encrypted notes and must not parse content to find ids.

**D8. Reactions as a per-account field family.** `comment.reactions.<account id>` is a string list of reaction names from the closed set `thumbs_up`, `heart`, `check`, `eyes`, `party`, `question` (at most six, distinct). The server accepts the op only when `<account id>` is the submitting account (any other key is `forbidden`), so each key has one writer and per-field LWW across that person's devices is exact; concurrent reactions by different people touch different keys and never conflict. The name set is validated at receipt and unknown names are refused. Reactions are plaintext for encrypted accounts (they reveal only who reacted with which of six names) and are listed in the "Encrypted and plaintext fields" documentation. Rendering: one `Icon` per reaction name (`thumbs-up`, `heart`, `check`, `eye`, `party-popper`, `circle-help` from the catalogue), never an emoji glyph. The REST representation aggregates to `reactions: {thumbs_up: [ids…], …}` and `my_reactions: [...]`; `PUT /api/v1/comments/{id}/reactions` with `{reactions: [...]}` replaces the caller's own list through `ApplyStrict`. Alternatives: (a) one `reactions` map on the comment. Rejected: LWW on the whole map loses concurrent reactions. (b) A `reaction` entity per person per comment. Rejected: tombstones and ids for a toggle, more rows than the thing deserves.

**D9. Slash menu and toolbar.** Typing `/` at the start of a line or after a space opens a filtered list (heading 1 to 3, bullet, numbered, checklist, table, quote, code, link, image, date, mention; comments have no Make subtask); arrows move, Enter applies, Escape closes, any other key filters. The date command inserts today's or a typed date in the user's date format as text. On a coarse pointer a single toolbar row (bold, italic, link, list, checklist, more) sits above the editor while it has focus and is a sheet-free, non-sticky part of the panel's own scroller. Interface budget: no chrome row is added to any page (the toolbar lives inside the panel and only while editing), the panel keeps one scroll region, the composer still rests as one line, the notes clamp is unchanged, no task property is added to rows, and no new global shortcut is registered: the editor's keys apply inside the editor only, are listed in the cheat sheet's editing section, and `Mod-Shift-Enter` (Make subtask) is checked against the registry's conflict test like every key.

**D10. Spec placement.** Reactions are ADDED requirements in `comments` ("Reactions", "Reaction routes") rather than edits of "Comment entity" (which `task-pages` modifies); the one MODIFIED "Comment entity" text here includes `task-pages`' guest fields so the archived result is coherent whichever archives first. Mentions in notes are an ADDED requirement in `rich-text-editing`, not a change to comments "Mentions". Plaintext of reactions and note mentions is an ADDED requirement in `end-to-end-encryption`, leaving "Encrypted and plaintext fields" untouched.

## Risks / Trade-offs

- [A comment edited in the editor changes its Markdown spelling (`_a_` becomes `*a*`)] → the subset normalises deliberately; the edited marker already tells readers the body changed; a test pins that an untouched comment opened and sent again is byte-identical for every row of the D1 table.
- [`prosemirror-tables` adds a dependency] → lazy chunk only, pinned exact version, size measured in task 7.3, and the table commands are wrapped so the package can be swapped.
- [Tables in notes make the projection wide] → cells are inline only and capped; list previews already truncate.
- [Reaction spam] → the existing comment rate limit applies to reaction ops (60 per minute per account); the set is six names.
- [Mention notifications from notes could fire on every save] → the server notifies only accounts newly present in `note_mentions` compared with the stored value, as for comments.
- [An encrypted account's embedded image needs the attachment decrypted before the note renders] → the placeholder shows until the blob is ready; a locked device shows "Encrypted image".
- [The first expanded comment on a slow connection waits for the editor chunk] → the plain field keeps the text and sends it as Markdown if the user submits before the chunk arrives.

## Migration Plan

Additive op schema (`task.note_mentions`, the `reactions.` family on comments); no SQLite migration (fields are materialised generically). Older clients ignore both, keep unknown editor nodes through the merge, and render the projection. Rollback: a server without this change refuses nothing from older clients and ignores no stored data; a client without it shows tables as pipe text in the projection. No environment variable. CHANGELOG upgrade note: none beyond "upgrade the server before the devices".

## Open Questions

- Whether the touch toolbar should also appear on fine pointers as an opt-in preference can be decided after use without changing the specs.
- The exact catalogue icon for the "question" reaction (`circle-help` or `circle-question-mark`) is settled when the icon catalogue is checked in task 5.2.
