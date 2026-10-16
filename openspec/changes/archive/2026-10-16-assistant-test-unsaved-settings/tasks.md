# Tasks

## 1. Server

- [x] 1.1 Extract the provider validation used by `SaveSettings` into one function, and add `MergeDraft` (owner) and `MemberDraft` (member) in `internal/assistant` (D1, D2). Verify with unit tests: absent fields fall back to saved values, `key: ""` means no key, a saved member key is used only for the provider it was saved for, and an empty model or a `compatible` provider without a base URL fails naming the field. Run `go test ./internal/assistant/...`.
- [x] 1.2 Make `handleTestAssistant` read `model`, `base_url`, `key` and `allow_private_endpoint`, and `TestConnection` test the merged values (D1–D3). Verify with httpapi tests against a fake provider: an unsaved model and key reach the fake with those values while `GET /api/v1/settings/assistant` is unchanged; a replacement key is used and the saved key kept; `key: ""` gives `no_key` with no request; a private base URL with the switch on in the request is reached and with it off answers 400 `private_target`; `{provider}` alone tests the saved settings; a member, a token and an anonymous call get 403/403/401 with no request; no audit entry is written and the key appears in neither the response nor the captured log. Run `go test ./...`.
- [x] 1.3 Make `handleTestMyAssistant` read `provider`, `model` and `key`, test the merged member values without requiring a saved own provider, and keep the rate limit and the built-in host check. Verify with httpapi tests: a member with nothing saved tests Gemini with typed values and their settings stay unchanged; a key saved for OpenAI is not used for Anthropic (`no_key`, no request); `provider: "compatible"` answers 400; the sixth test in 10 minutes answers 429; only the chosen built-in host is contacted. Run `go test ./...`.

## 2. Web

- [x] 2.1 Send the on-screen values from `api.testAssistant` and `api.testMyAssistant` (D1). Verify with a vitest test that the request body carries the draft model, base URL, private switch and typed key (or `""` after "Remove saved key", and no `key` when untouched).
- [x] 2.2 In `AssistantSettings.tsx`: show "Enter a model id to test" instead of sending when the model is empty; clear a provider's result when a tested value changes; show "Connection works. Save to use these settings." after a passing test of unsaved values; offer the member's Test connection as soon as "Use my own provider" is selected; disable Test offline with "Needs a connection" (D4). Verify with happy-dom interaction tests for each, then run `npm test` and `npm run build` in `web/`.

## 3. Docs and integration

- [x] 3.1 Update `docs/assistant.md` (Test checks what is on screen and saves nothing) and `docs/api.md` (the optional request fields of both test routes). Verify the docs build and the API examples match the handler tests.
- [x] 3.2 Run `make check` and `npx @fission-ai/openspec validate --all --strict`, then reproduce the reported case by hand: on a fresh server, type an OpenAI model and key without saving and select Test connection. Verify it no longer says "enter a model id first" and reports the provider's real result.
