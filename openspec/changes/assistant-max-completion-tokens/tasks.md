# Tasks

## 1. Server

- [x] 1.1 `internal/assistant/chat.go`: `refusedParam` reads the `param` of a 400 and `askAgain` sends the limit as `max_completion_tokens` after a refusal naming `max_tokens`, beside the `reasoning_effort` retry. Verified: `TestChatMaxCompletionTokens` and `TestTestConnectionAzureV1` in `go test ./internal/assistant`.

## 2. Device

- [x] 2.1 `web/src/lib/assistantDevice/providers.ts`: the same in `chatProvider`. Verified: "asks once more with max_completion_tokens when max_tokens is refused (#2087)" in `providers.test.ts` (`npm test` in web/).

## 3. Release

- [x] 3.1 Changelog fragment `changelog.d/Fixed/assistant-max-completion-tokens.md`; `docs/assistant-setup.md` names the behaviour and the Azure OpenAI setup. Verified: `make docs-check` and `openspec validate --all --strict`.
