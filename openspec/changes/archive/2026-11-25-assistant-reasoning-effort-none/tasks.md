# Tasks

## 1. Server

- [x] 1.1 `internal/assistant/chat.go`: `effortRefusal` reads `param` of a 400; `post` asks once more with `reasoning_effort: "none"` for a request with tools, and the conversation keeps it. Verified: `TestChatReasoningEffortNone` in `go test ./internal/assistant`.

## 2. Device

- [x] 2.1 `web/src/lib/assistantDevice/providers.ts`: the same in `chatProvider`. Verified: "asks once more with reasoning_effort none when tools need it (#2045)" in `providers.test.ts` (`npm test` in web/).

## 3. Release

- [x] 3.1 Changelog fragment `changelog.d/Fixed/assistant-reasoning-effort-none.md`; `docs/assistant-setup.md` names the behaviour. Verified: `make docs-check` and `openspec validate --all --strict`.
