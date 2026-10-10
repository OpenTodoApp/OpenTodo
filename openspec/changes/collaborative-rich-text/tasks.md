# Tasks

## 1. Server: schema and limits

- [x] 1.1 Add `task.notes_doc` to `Schema` in `internal/sync/ops.go` with a new document kind (base64 string, 256 KB cap for this kind only) and keep the 64 KB cap for every other kind; verify `go test ./...` passes new `TestNotesDocValidation` (accepts valid base64 up to the cap, rejects non-base64, rejects 256 KB + 1, other fields still capped at 64 KB)
- [x] 1.2 Accept and return `notes_doc` on REST task create/patch/get/list and include it in the export; verify `go test ./...` passes `TestRestNotesDocRoundTrip` (POST with `notes_doc` returns it, invalid value is 400 `invalid_input`, export contains the field)
- [x] 1.3 Update `docs/sync.md` schema table and add a "Mergeable documents" section (full-state register, merge-and-republish, projection rule), `docs/api.md` (`notes_doc`, `description` is Markdown); verify the documented limits match the constants in `ops.go`

## 2. Client: data layer

- [x] 2.1 Add `notes_doc` to `Task`, `TASK_FIELDS`, the `mutate()` defaults (`""`) and the Dexie schema version; verify `npm test` passes updated `ops.test.ts` (new task has empty `notes_doc`; unknown field still ignored) — no Dexie version bump: the field is not indexed (design.md, Implementation notes)
- [x] 2.2 Add the document library and `web/src/lib/richtext.ts`: encode/decode, merge, state-vector containment check, Markdown projection and parsing for the supported node set; verify `npm test` passes new `richtext.test.ts` (`projection renders every node type`, `parse(render(doc)) is stable`, `unknown marks survive merge`)
- [x] 2.3 Implement merge-and-republish in `applyOps` for document fields: merge the winning remote state with the local document, republish `notes_doc` + `description` only when the merge grew the state; verify `npm test` passes `concurrent inserts converge on both replicas`, `randomized interleavings converge`, `merge of identical states emits no op` (in `notes.test.ts`)
- [x] 2.4 Implement the fold-back rule: a newer `description` without a matching `notes_doc` replaces the document body from Markdown and republishes the pair; an older one is re-projected from the document; verify `npm test` passes `REST description write becomes document`, `stale description does not override document`
- [x] 2.5 Coalesce pending outbox ops for document fields by `(entity, entityId, field)` and enforce the 256 KB cap before enqueueing; verify `npm test` passes `outbox keeps one doc op per task`, `oversized document is refused locally`

## 3. Client: editor

- [x] 3.1 Add the editor core and CRDT binding as a lazily imported chunk; verify `npm run build` shows the editor in a separate chunk and the initial JS chunk size is within 5 KB of the pre-change size (record both numbers in the PR) — 879.85 → 883.92 KB raw, 257.48 → 258.93 KB gzipped; `richtext` 28.26 KB and `NotesEditor` 68.85 KB gzipped lazy chunks (design.md)
- [ ] 3.2 Replace the notes textarea in `TaskDetail` with the editor: supported node set, keyboard shortcuts for every mark and block type, Markdown input rules, 400 ms debounce with flush on blur/close/visibility/unload; verify in the browser that `- ` creates a bullet, the bold shortcut bolds the selection, and a reload after an offline edit shows the formatted note — implemented; headless tests pass for the bold shortcut and every input rule (`richtextEditor.test.ts`), but the single allowed browser run failed its "Ctrl+B bolds the selection" check (keys sent with no delay right after Shift+Arrow selection; likely ProseMirror had not yet read the DOM selection, not confirmed), so the browser part, including the offline reload, is unverified
- [ ] 3.3 Apply remote merges through the binding so caret and in-progress typing survive; verify in two browsers that typing on A while B inserts above the caret keeps A's caret and text — implemented and unit-tested (`a remote insertion above the caret keeps the caret and the local typing`); the two-browser check was not reached in the single browser run
- [ ] 3.4 Size warning at 90% of the cap and refusal of further input at the cap; decode failures fall back to rendering `description` with a notice; verify `npm test` passes `editor state refuses input at cap` and in the browser a corrupted `notes_doc` still opens the panel — implemented; `npm test` part passes; the browser check of a corrupted note was not reached
- [x] 3.5 Lazy upgrade of legacy notes on first open (empty `notes_doc` built from `description`); verify in the browser that a task created through REST with Markdown text opens as formatted notes and the next sync carries `notes_doc` — verified in the browser run (heading, check item and bold rendered; REST read showed `ydoc:v1:` afterwards); also `legacy notes are upgraded when opened` in `notes.test.ts`

## 4. Docs and integration

- [x] 4.1 Update `docs/architecture.md` (client module table), `README.md` feature list, `CHANGELOG.md` Unreleased; verify links resolve
- [ ] 4.2 Two-browser end-to-end run against the production binary: both edit the same note offline, reconnect, both show both edits; REST PATCH of `description` appears formatted; export contains Markdown and `notes_doc`; verify the run finishes with "E2E OK" and no console errors — the run was written and executed once against the production binary (no console errors) but stopped at the Ctrl+B check (see 3.2) before the offline part; offline convergence, REST fold-back and export are covered by `notes.test.ts` and `TestRestNotesDocRoundTrip`, not by a browser
- [x] 4.3 Run `make check`; verify it passes including `openspec validate --all --strict`
