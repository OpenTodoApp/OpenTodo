# Tasks

## 1. Server

- [x] 1.1 Add `assistant_consent.seen_version` (Go migration step), `Consent.SeenVersion`, `CompleteDisclosureVersion`, `Consent.NeedsNotice` and `Store.MarkDisclosureSeen` (`internal/assistant`, `internal/store`). Verify `go test ./internal/assistant ./internal/store`
- [x] 1.2 Return `disclosure_notice` from `GET /api/v1/me/assistant` and add `POST /api/v1/me/assistant/disclosure-seen` (sessions and full tokens) (design D2, D3). Verify `go test ./internal/httpapi -run DisclosureNotice` (older consent, Got it, current consent, device consent, 409 without consent, 401, read token refused)

## 2. App

- [x] 2.1 Add `DisclosureNotice` (`web/src/app/assistant/DisclosureNotice.tsx`) with Review the list, Turn off the assistant and Got it, shown in the panel body and on the Routines page; a story in the assistant screens. Verify `npm test -- disclosureNotice` and `make ui-lint`
- [x] 2.2 Translate the new messages in the five catalogues. Verify `make i18n-check`

## 3. Docs

- [x] 3.1 Describe the notice in `docs/assistant-settings.md` (linked from `docs/assistant-privacy.md`, which is at its word limit) and the route and fields in `docs/api.md`. Verify `make docs-check`
- [x] 3.2 `make check`
