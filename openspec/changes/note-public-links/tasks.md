# Tasks

## 1. Server

- [ ] 1.1 Migration adding `kind` and `note_id` to the page table; the shared page store reads both kinds; verify with `go test ./internal/store ./internal/httpapi`
- [ ] 1.2 `POST|GET|DELETE /api/v1/notes/{id}/page` and `PUT /api/v1/notes/{id}/page/snapshot` through `routes.handle` with the task page policies and `.demoDenied()`, plus the deny-list entry in `internal/httpapi/demo.go`; tests for publish, status, revoke, anonymous, `read`/`agent` tokens, editor refused, invalid input, demo; verify with `go test ./internal/httpapi`
- [ ] 1.3 `GET /api/v1/pages/{secret}` answers `kind: "note"` with title, stripped Markdown, change time and attachments; files inline for raster images; lifecycle re-check; headers; shared limits; verify with `go test ./internal/httpapi`

## 2. Web

- [ ] 2.1 "Publish note page…" in the note menu, the dialog and the Published marker, disabled offline; interaction tests for "Publish and copy", "Keyboard only" and "Offline"; verify with `npm test` in web/
- [ ] 2.2 The note layout of the public page (`/n/<secret>`), links as text, images, files, refresh, 360 px; encrypted snapshot upload and re-upload; tests for "Guest opens it", "Link to another note" and "Encrypted note page"; verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [ ] 3.1 `docs/note-pages.md`, `docs/notes.md`, `docs/task-pages.md` (shared limits), catalogs (`make i18n-check`), `changelog.d/Added/note-public-links.md`, the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 `make bundle-budget`, `make openspec-validate`, `make check`
