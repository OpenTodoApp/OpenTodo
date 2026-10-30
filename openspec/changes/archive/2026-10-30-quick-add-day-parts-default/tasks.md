# Tasks

## 1. Server

- [x] 1.1 Make `day_parts` optional in `parseRequest` and default it to `user_prefs.day_parts` in `parseAccount` (`internal/httpapi/quickadd.go`). Verify `TestQuickAddParseDayPartsDefault` in `internal/httpapi/daypart_test.go` (preference off and on, each with `day_parts` absent, true and false); run `go test ./...`

## 2. Clients and docs

- [x] 2.1 Confirm the browser extension does not send `day_parts` (`extension/api.js` posts `line`, `url`, `today`, `now` only), so it picks up the part phrases while the preference is on. Verify `node --test` in `extension/` still passes
- [x] 2.2 Update `docs/api.md` (Quick-add parse), `docs/day-parts.md` (Type it) and `docs/capture.md` (Quick save chips); add a CHANGELOG entry. Verify `make docs-check` and `make openspec-validate`
