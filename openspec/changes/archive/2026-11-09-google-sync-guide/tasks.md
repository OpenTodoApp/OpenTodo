# Tasks

## 1. Server

- [x] 1.1 Results for the callback's error, the exchange's refusals, the missing calendar scope and a 403 discovery in `internal/calsync/google.go`; the refusing status on `calsync.Error`. Verified by `go test ./internal/calsync/ -run TestGoogleResults`.
- [x] 1.2 The callback and the code exchange return them; the start refuses `base_url_mismatch` when the `Origin` is not the redirect address's origin. Verified by `go test ./internal/httpapi/ -run TestGoogleConnectNamesTheCause` (each cause, an unknown error kept generic, the secret absent from the answer).
- [x] 1.3 The new error code in `web/src/lib/i18n/server-error-codes.json` and `docs/api.md`. Verified by `go test ./internal/httpapi/ -run 'TestErrorCodesFixture|TestAPIDocs'`.

## 2. Panel

- [x] 2.1 A translated message per result and for `base_url_mismatch`, with Learn more opening Help at the section that fixes it (help screens `calendar-sync/<result>` in the guide's `screens`). Verified by `web/src/app/calendarSyncSettings.test.tsx` (`npx vitest run` in `web/`): the notice, its Learn more screen, and every screen resolving to a section of the guide; `make docs-check` checks each screen is linked.
- [x] 2.2 New strings in every shipped catalogue. Verified by `make i18n-check`.

## 3. Guide

- [x] 3.1 Step-by-step Google client set-up for the console as of November 2026 and "Fix a failed Google connection" in `docs/calendar-sync.md`. Verified by `make docs` and `make docs-check`.
