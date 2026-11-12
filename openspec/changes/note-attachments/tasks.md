# Tasks

## 1. Server

- [ ] 1.1 `attachment.note_id` in `internal/sync/ops.go` Schema, regenerate (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`); verify with `go test ./internal/sync`
- [ ] 1.2 One parent rule, scope from the note, authorship and removal rights by the note's scope; tests for "Attach to a note offline", "Two parents" and "Viewer of a shared note"; verify with `go test ./internal/sync`
- [ ] 1.3 `GET|POST /api/v1/notes/{id}/attachments` through `routes.handle` with `signedIn`, the token scopes and demo rules of the task routes; tests for anonymous, `read` token and unreadable note; verify with `go test ./internal/httpapi`
- [ ] 1.4 Quota, retention, purge with the note and the orphan sweep count note attachments; copy rows share the stored file; verify with `go test ./internal/blobs ./internal/sync ./internal/httpapi`

## 2. Web

- [ ] 2.1 `web/src/lib/attachments.ts` and the offline queue accept a note parent; unit tests for queue order and removal before upload; verify with `npm test -- attachments` in web/
- [ ] 2.2 Images in the standalone note editor (slash menu, paste, drop) and embed resolution by note in `markdown.ts`; interaction tests for "Paste a photo into a note" and "Image from another note"; verify with `npm test` in web/
- [ ] 2.3 The files list below a standalone note, shown only with attachments; conversions move attachments in one batch with one Undo; verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [ ] 3.1 `docs/attachments.md`, `docs/notes.md` (remove "images … are not offered in standalone notes"), catalogs (`make i18n-check`), `changelog.d/Added/note-attachments.md`, the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 `make bundle-budget`, `make openspec-validate`, `make check`
