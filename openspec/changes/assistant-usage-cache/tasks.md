# Tasks

## 1. Server

- [ ] 1.1 `Round` carries cached read and write; the Anthropic, Chat Completions (OpenAI and compatible) and Gemini adapters read their cache fields. Verify with provider tests on recorded usage payloads in `internal/assistant`; run `go test ./...`.
- [ ] 1.2 Migration for `cached_read` and `cached_write`, the weighted counted total, and `cached_tokens` on the usage route. Verify with `internal/httpapi` tests for the "A cached turn" and "Usage route reports cache" scenarios and the 401; run `go test ./...`.

## 2. Web

- [ ] 2.1 The usage line names the cached part, for the server and the device loop. Verify with a test in `assistantPanel.test.tsx`; run `npm test` and `npm run build` in `web/`.
- [ ] 2.2 Strings in every locale. Verify with `make i18n-check`.
