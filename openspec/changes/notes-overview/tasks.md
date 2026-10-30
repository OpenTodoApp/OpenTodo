# Tasks

Prerequisites: `notes-compaction` and `notes-save-cadence` are merged; `notes-toolbar-desktop` is used when present.

## 1. Entity and sync

- [ ] 1.1 `internal/sync/ops.go`: the `note` entity (D1 fields, content flags, comments), `DocFields["note.notes_doc"]`, `Plural["notes"]`; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/... ./internal/e2ee/...` (valid ops apply; an oversized document is refused; `title`, `description`, `notes_doc` are in the content list)
- [ ] 1.2 `scope.go`: `note` as a project child; `CanWrite` for owner, admin and editor; `restoreOps` for refused note ops; `members.go`: first share relabels notes, deleting a shared project tombstones them; tests for viewer refusal, `scope_change`, relabel keeping `seq`, catch-up replay for a new member; verify `go test ./internal/sync/...`
- [ ] 1.3 Convergence: the random-history convergence test includes notes (title LWW, document merge, labels array); verify `go test ./internal/sync/...`
- [ ] 1.4 `trash.go`: note purge, cascade from a purged project, retention; `next.go` includes notes in the next retention time; verify `go test ./internal/sync/...`
- [ ] 1.5 Web: `web/src/lib/types.ts` (`Note`), Dexie version 27 `notes: 'id, project_id'`, `tableOf('note')`, re-seed after a restore and refusal handling include notes, `withNotePairs` for `note`; verify `npm test` (generation mismatch re-emits note fields; a refused note op restores the server value)

## 2. Server routes and integrations

- [ ] 2.1 REST collection `/api/v1/notes` through the generic handlers; validation of `title` length and `project_id`; `docs/api.md`; verify `go test ./internal/httpapi/...` (201 create, 401 without credentials, 403 for a read token on write, 403 `forbidden` for a viewer, 404 for an unknown id; the route matrix)
- [ ] 2.2 `GET /api/v1/notes/{id}/history` and `DELETE /api/v1/notes/{id}/purge` registered with `signedIn` through `routes.handle`; `POST /api/v1/trash/purge` includes notes; verify tests for 200, 401, 404 and 409 `not_deleted`, and `policy_test.go`
- [ ] 2.3 Export includes `notes`; the own-export importer recreates them (device `import`); other importers never create notes; verify `go test ./internal/httpapi/... ./internal/importer/...` (round trip of five notes)
- [ ] 2.4 `internal/agenttools`: `list_notes` and `get_note` read tools (filters, text query on plaintext accounts, untrusted-text marking, `e2ee.Display` on encrypted accounts); MCP exposes them behind `mcp.enabled`; no write tool; verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [ ] 2.5 CLI `ot notes` (list with `--project`, `--label`, `--standalone`, `--search`; `show`; `add` with `--project`, `--body`), table and `--json`; `docs/cli.md`; verify `go test ./internal/cli/...`
- [ ] 2.6 Left out: tests that CalDAV serves no note, webhooks queue nothing for note ops, `internal/activity` derives no event from note ops (TS and Go, shared fixture unchanged), rules ignore notes, the vault ignores them; verify `go test ./internal/caldav/... ./internal/webhook/... ./internal/activity/... ./internal/rules/... ./internal/vault/...` and `npm test`
- [ ] 2.7 Compaction covers `note.notes_doc` and its `description` (a test in the compaction suite); verify `go test ./internal/sync/...`

## 3. Filter terms

- [ ] 3.1 `web/src/lib/filter`: `notes`, `no notes`, `notes: text`, reserved word, error for `notes:`; evaluation over the decrypted description; verify `npm test`
- [ ] 3.2 `internal/filter`: the same grammar; queries added to `internal/filter/testdata/formatted.txt` (read by both test suites) and the error case to the shared vectors; verify `go test ./internal/filter/...` and `npm test`

## 4. Notes page and search

- [ ] 4.1 `web/src/lib/notes.ts`: the three sources, "updated" from field clocks (D3), sorting, pagination of 50, filters; unit tests (a task's due-date change does not move its note; deleted and purged never listed; completed and archived marked); verify `npm test`
- [ ] 4.2 Search index and snippets (D4): normalisation (NFKD, marks removed, locale lower case), Markdown stripping, phrase quotes, ranking, snippet with `<mark>` as text, built lazily, updated from live changes, dropped on lock; unit tests for every scenario of "Searching notes on the device"; a count test that a keystroke reads IndexedDB zero times; verify `npm test`
- [ ] 4.3 `web/src/app/notes/`: the lazy route `/notes` and `/notes/<id>`, header and the one filter row, rows (source icon, title, preview or snippet, project, labels, updated), Show more with "50 of 312", empty state, the note panel and phone page (title, editor with `entity: 'note'` and without mentions, images and make subtask, project and label Comboboxes); happy-dom tests per page scenario; verify `npm test`
- [ ] 4.4 Conversions (D6): Turn into task, Move note to a new note, each one batch with Undo, the clear as a document deletion; tests including "an older copy does not bring the text back" with two simulated devices; verify `npm test`
- [ ] 4.5 Sidebar: Notes in More after Focus, promotable except in Open Loops first; `budget.test.tsx`; verify `npm test`
- [ ] 4.6 Shortcuts: `go.notes` `g e`, `notes.new` `q` and `notes.search` `/` as view-scoped overrides in `web/src/lib/shortcuts.ts`; the registry conflict test; the cheat sheet; verify `npm test`
- [ ] 4.7 Palette: Notes section with snippets, task snippets, "Go to Notes", "New note"; verify `palette.test.tsx`, `registry.test.tsx`
- [ ] 4.8 Phone: filters sheet, 48 px rows, the layout check at 390 px; verify `make e2e` (frame step) and a happy-dom test
- [ ] 4.9 Trash lists notes with restore and purge; verify a happy-dom test
- [ ] 4.10 Strings in the six catalogs; verify `make i18n-check`
- [ ] 4.11 Stories for the note row, the empty state and the filter row; verify `make ui-lint`, `make ui-check`

## 5. Docs and checks

- [ ] 5.1 docs/sync.md (the `note` entity, scope rules), docs/api.md, docs/cli.md, docs/filters.md (`notes` terms), a user guide page `docs/notes.md`, the MCP tool list, ROADMAP shipped row at archive; verify `make docs-check`
- [ ] 5.2 Bundle: measure; raise `web/bundle-budget.json` only with the reason, keeping the page lazy; verify `make bundle-budget`
- [ ] 5.3 CHANGELOG Unreleased entry (at archive)
- [ ] 5.4 `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
