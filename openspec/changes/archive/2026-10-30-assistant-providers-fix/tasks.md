# Tasks

## 1. Shared vectors and the server classifier

- [x] 1.1 Add `web/src/lib/assistantDevice/errors.vectors.json` with the cases from design D5: Google's invalid key (array, 400 `INVALID_ARGUMENT`), Google's unknown model (array, 404 `NOT_FOUND`), Google's wrong path (404, empty body), OpenAI's `invalid_api_key` object (401), the compatible 404 with an empty body, a 429, a 503, and a plain 400 schema refusal, each with the expected `code`, `type` and whether the compatible hint applies. Verify the file parses in both test suites (1.2 and 2.1)
- [x] 1.2 Replace `errorType` in `internal/assistant/chat.go` with a classifier that reads an object or one-element array (bounded at 4 KiB), takes the type from `type`, a string `code` or `status`, and detects the invalid-key 400 (design D1). Add `CodeProviderNotFound` and its fixed messages to `internal/assistant/provider.go` (`providerErr` takes the provider name for the compatible hint). Verify `go test ./internal/assistant/ -run 'Vectors|Provider'` with a test reading the vectors through `checkFile`
- [x] 1.3 In `Service.test` (`internal/assistant/service.go`), make the no-tools retry run only for `provider_error` 4xx other than 404. Verify a `providers_test.go` case where an httptest fake answers Google's invalid-key body: one request recorded, code `provider_auth`, and Google's message absent from the result
- [x] 1.4 Check that the turn route reports `provider_auth` and `provider_not_found` through `event: error` with no key and no provider text. Verify with an `internal/httpapi/assistant_test.go` case against a fake Gemini; run `go test ./...`

## 2. On-device classifier

- [x] 2.1 Make `statusError` in `web/src/lib/assistantDevice/providers.ts` read the bounded error body with the same rules and map 404 to `provider_not_found` with the device wording. Verify `npm test -- assistantDevice` with `providers.test.ts` running every case in `errors.vectors.json`
- [x] 2.2 Make the device's connection test skip its tool-less retry for `provider_auth` and `provider_not_found`. Verify with a providers test counting fetch calls

## 3. Compatible base URL trim

- [x] 3.1 Trim a trailing `/chat/completions` (and slash) from the compatible base URL in the save validation and the test draft merge (`internal/assistant/config.go`, `service.go`), and where the provider is built. Verify `go test ./internal/assistant/` cases for the pasted URL, the plain `/v1` URL, and a fake endpoint that records exactly one `/chat/completions` path
- [x] 3.2 Apply the same trim in `baseUrlOf` (`web/src/lib/assistantDevice/settings.ts`). Verify with a settings test; run `npm test` and `npm run build` in `web/`

## 4. Form, docs and translations

- [x] 4.1 Show `provider_not_found` results in the owner's and member's settings forms and the device setup like other provider results (the message comes from the server or the device). Translate the new device wording in all six locales. Verify `npm test -- AssistantSettings` and `make i18n-check`
- [x] 4.2 Document `provider_not_found` in `docs/api.md` (test result codes and the turn's `event: error`). Add a "Test connection says no such model or endpoint" note to `docs/assistant-setup.md`, mentioning the base URL trim and that Gemini reports a wrong key as HTTP 400; add a CHANGELOG.md Unreleased entry (Fixes #501). Verify `make docs-check` and `make repo-check`
- [x] 4.3 Run `make check`. Then comment on #501 with the root-cause summary from proposal.md (the reply was OpenTodo's own route 404, already diagnosed by #502; the Gemini error reading is fixed here), and verify the PR closes it
