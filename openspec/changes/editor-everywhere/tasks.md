# Tasks

## 1. Data model and sync

- [ ] 1.1 Add `task.note_mentions` (`kIDList`, default `[]`) and the comment field family `reactions.<account id>` (string list from the closed set of six names, distinct, at most six) to `internal/sync/ops.go` `Schema` and the prefix check, with the author rule (the key must equal the submitting account, else `forbidden`) and member filtering of `note_mentions` in `internal/sync/comments.go` or a sibling; verify with table tests in `go test ./internal/sync/...` covering "Reactions" (concurrent accounts, toggle, forged key, unknown name) and "Mentions in notes" (non-member dropped, personal task emptied)
- [ ] 1.2 Add both fields to `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`, `mutate()` helpers in `web/src/lib/comments.ts` (`setMyReactions`, aggregation helpers) and the note-mention writer in the notes save path; verify with vitest for offline toggle, two-account convergence and that an unchanged list produces no op (`npm test`)
- [ ] 1.3 Keep both fields plaintext: document them in `docs/e2ee.md` and assert in `web/src/lib/e2ee.test.ts` and `go test ./internal/e2ee/...` that neither is a content field; verify the three scenarios of "Reactions, note mentions and embedded images under encryption" (the image one in 4.3)
- [ ] 1.4 Notify newly listed note mentions through `notify.MentionSink` with `source: "note"` after the batch commits, never for ids already stored; verify with `go test ./internal/sync/... ./internal/notify/...` ("Mention in a note", "Edited note does not re-notify") and the in-app inbox wording test
- [ ] 1.5 Ignore reaction ops and fold `note_mentions` into the note edit in `internal/activity` and `web/src/lib/activity.ts`, adding both cases to `internal/activity/testdata/activity_fixture.json`; verify `go test ./internal/activity/...` and `npm test -- activity` pass on the shared fixture
- [ ] 1.6 Include reactions and `note_mentions` in the export and the own-format import; verify the round-trip test in `go test ./internal/importer/...` and `docs/import-export.md` updated

## 2. Editor schema, model and projection

- [ ] 2.1 Add `prosemirror-tables` (exact version) to `web/package.json`; verify `npm ci` succeeds and the package appears only in the lazy editor chunk of `npm run build`
- [ ] 2.2 Add `blockquote`, `code_block` (`lang`), `table`, `table_row`, `table_cell`, `table_header` (inline-only cells, alignment attrs) and `image` (`id`, `alt`) nodes and the `mention` (`id`, `name`) mark to the schema in `web/src/lib/richtextEditor.ts` and to the model in `web/src/lib/richtext.ts` (`toModel`, `insertModel`, `updateBody`, `normalizeModel`); verify vitest that a document with every node survives Yjs encode, merge and decode and that an unknown node from a newer client is kept (`npm test -- richtext`)
- [ ] 2.3 Extend `renderMarkdown` and `parseMarkdown` in `richtext.ts` for quotes, fenced code, pipe tables (escaping `|`, 10 × 100 cap), `![alt](attachment:<id>)`, `@name` with a member resolver, and raw text preservation; verify a table-driven vitest with one row per line of the design's D1 table asserting parse → render is byte-identical, plus "Table projection"
- [ ] 2.4 Extend `web/src/lib/markdown.ts` and `web/src/app/Markdown.tsx` to render tables (scrolling in their box), images that name an attachment of the same task (blob or authenticated route; "Removed image" otherwise), mentions as chips and issue links as origin chips; verify happy-dom tests for "Table", "Image from the web stays a link", "Reference to another task's file", "Issue chip" and the existing script-tag test (`npm test -- markdown`)
- [ ] 2.5 Update `docs/api.md` (`description` subset, comment bodies, `note_mentions`, `reactions`, `my_reactions`, the reactions route) and `docs/sync.md` (the `reactions.` family); verify `make docs-check`

## 3. Editor features

- [ ] 3.1 Slash command menu plugin (`/` at line start or after a space, filtered listbox, arrows, Enter, Escape, closes on no match, date command in the user's format); verify happy-dom tests for "Insert a table by keyboard", "No match" and "Date" (`npm test -- slash`)
- [ ] 3.2 Table editing: insert, Tab and Shift+Tab, row and column commands in a cell context menu and the slash menu, limits refused with a message, horizontal scroll inside the box; verify happy-dom tests for "Column limit" and "Narrow screen" at 360 px and a vitest for "Concurrent cell edits" through two Yjs docs
- [ ] 3.3 Block quote and code block input rules and keys (code blocks suspend input rules); verify "Quote and code block" in a happy-dom test
- [ ] 3.4 Mentions in the editor: `@` completion from the member cache (reuse `mentionCandidates`), the mark, and the `note_mentions` write in the same mutation as the note; verify happy-dom test "Mention in a note" writing both fields in one batch
- [ ] 3.5 Make subtask (slash menu, context menu, `Mod-Shift-Enter` registered in `web/src/lib/shortcuts.ts` with scope editor): one `mutateMany` creating the subtask (project, checked → completed) and rewriting the line into a `[title](?task=<id>)` link, Undo in one step, link rendered with the live title; verify happy-dom tests for "Make subtask offline", "Undo", "Subtask retitled", "From a checked line" and that the registry conflict test passes
- [ ] 3.6 Touch toolbar (coarse pointer, focused editor only, inside the panel scroller, accessible names); verify a happy-dom test with a coarse-pointer media stub for "Phone editing" and `web/src/app/budget.test.tsx` still reporting one scroll region and no new chrome row
- [ ] 3.7 Cheat sheet: add the editor's keys to the editing section through the registry and `docs/keyboard.md`; verify the registry-driven guide test and `make docs-check`

## 4. Images from attachments

- [ ] 4.1 Drop, paste and the Image command in the editor create the attachment through `web/src/lib/attachments.ts` and insert the image node in one undoable change; verify happy-dom test "Paste a screenshot into a note" (attachment queued, node inserted, projection contains the reference)
- [ ] 4.2 Image node view: available bytes from the authenticated route, uploading and waiting placeholders, "Removed image", selectable and deletable by keyboard, editable alt text, web addresses become links; verify happy-dom tests for "Attachment removed", "Web image stays a link" and "Embedded attachment while uploading"
- [ ] 4.3 Encrypted accounts: reuse the thumbnail blob path to show decrypted images, "Encrypted image" on a locked device; verify `npm test -- e2ee` scenarios "Encrypted account" and "Embedded image on a locked device"
- [ ] 4.4 Removal confirmation naming the note when an attachment is embedded on this device; verify the happy-dom test "Remove an embedded image" in `attachmentsRow.test.tsx`
- [ ] 4.5 Update `docs/attachments.md` and `docs/notes-and-subtasks.md` (images in notes); verify `make docs-check`

## 5. Comments

- [ ] 5.1 Expanded composer mounts the lazy editor on the parsed Markdown body, keeps the plain-field fallback while the chunk loads, serialises on submit, opens Edit with the parsed body; verify happy-dom tests in `commentsTab.test.tsx` for "Formatting from the keyboard", "Unchanged edit is byte-identical", "Text outside the subset survives an edit", "Draft survives closing the panel", "Collapses when left empty" and "Editor keys stay in the editor"
- [ ] 5.2 Reaction bar under each comment (six `Icon` names from the catalogue, counts, who-reacted tooltip and accessible text, Add reaction on hover, focus or More actions, toggling through `setMyReactions`); verify happy-dom tests for "Toggle own reaction", "Keyboard reaction" and "Deleted comment", and `make ui-lint` (no emoji glyph)
- [ ] 5.3 `GET /api/v1/tasks/{id}/comments` returns `reactions` and `my_reactions`; `PUT /api/v1/comments/{id}/reactions` registered with `signedIn.fullTokens()` through `ApplyStrict` with `NotifyApplied`; verify httptest tests for the five scenarios of "Reaction routes" and that `policy_test.go` passes (`go test ./internal/httpapi/...`)
- [ ] 5.4 Update `docs/comments-and-activity.md` (editor, reactions) and the comment section of `docs/api.md`; verify `make docs-check`

## 6. Stories, translations and screens

- [ ] 6.1 Translate every new string in the five catalogs; verify `node scripts/i18n-check.mjs`
- [ ] 6.2 Stories: `NotesEditor` with a table, an image placeholder, a quote and a mention; the slash menu open; the touch toolbar at 375 px; a comment thread with reactions and the expanded rich composer; verify `npm run storybook` renders them, the axe gate passes in light and dark at 375 and 1280 px, and `make ui-check` passes once baselines are generated (from CI's ui-check artifact, or `make ui-baselines` with Docker)
- [ ] 6.3 `web/src/app/budget.test.tsx` and `pageTemplate.test.ts` still pass with the toolbar and reaction bar (no new chrome row, one panel scroller, seven visible properties); verify `npm test -- budget pageTemplate`

## 7. Integration

- [ ] 7.1 CLI and MCP keep working on Markdown: `ot` shows a comment with a table as text and the MCP `add_comment` tool stores the Markdown it is given; verify the existing CLI and MCP tests pass (`go test ./internal/cli/... ./internal/mcp/...`)
- [ ] 7.2 Manual smoke on `make dev`: write a comment with a table and a pasted image on a phone-width viewport, react from two accounts, mention a member in a note and see the notification, Make subtask and Undo; record the result in this change's design "Implementation notes"
- [ ] 7.3 Measure and record in design D2 the main bundle and editor chunk sizes before and after (`npm run build` output) and the binary growth (`ls -l bin/opentodo`); verify the main bundle grew by at most 3 KB gzipped
- [ ] 7.4 Run `make check` and add the CHANGELOG.md entry under Unreleased (editor everywhere, reactions, mentions in notes, images, tables, Make subtask); verify `make check` passes
