# Tasks

## 1. Events

- [ ] 1.1 Accept `note.created`, `note.updated`, `note.deleted` in webhook validation and the API; unknown `note.*` names refused with 400 `invalid_input`; verify with `go test ./internal/httpapi -run Webhook`
- [ ] 1.2 Derive note events in `internal/webhook` from committed batches (precedence, last-writer-wins losers ignored, imports skipped, owner and shared-project members, project filter); verify with `go test ./internal/webhook` covering every scenario of "Note events"
- [ ] 1.3 Migration `webhook_note_holds` and the hold/release logic in the webhook job's next-due time (5 min quiet, 30 min cap, deleted sent at once); restart test with held rows; verify with `go test ./internal/webhook ./internal/store`
- [ ] 1.4 Payload `data.note` without `notes_doc`, `changes.description` without values, ciphertext strings for encrypted accounts; golden payload test; verify with `go test ./internal/webhook`

## 2. Screen

- [ ] 2.1 Notes group in the event picker of the Webhooks settings section, encrypted-account line; interaction test; verify with `npm test` and `npm run build` in web/

## 3. Docs and checks

- [ ] 3.1 `docs/webhooks.md` (events table, a note payload example, the quiet window), `docs/notes.md`, `docs/api.md`; strings in every catalog (`make i18n-check`); `changelog.d/Added/note-webhooks.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 Run `make openspec-validate` and `make check`
