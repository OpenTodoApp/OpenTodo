# Tasks

## 1. Skill definitions

- [x] 1.1 Add `internal/agenttools/skills.go` with the `Skill` type and the five definitions (D1, D6), plus a test that every skill's tools exist in the registry, `answer` skills list only read tools, and ids are unique and match the spec. Verify `go test ./...`.
- [x] 1.2 Add `GET /api/v1/assistant/skills` behind `requireAuth`, returning the list when the assistant is available to the caller, empty otherwise. Verify `httpapi` tests for available, disabled, encrypted account and `401` without auth. Run `go test ./...`.

## 2. Running skills

- [x] 2.1 Extend `turnRequest`/`TurnInput` with `skill` and `workday` (validated ranges), append the skill section to `SystemPrompt`, filter `Definitions` and refuse out-of-subset `Lookup`s, and return `400 unknown_skill` before any provider call (D2). Verify loop tests with the scripted fake provider: tools are filtered, an out-of-subset write is refused, an unknown id makes no provider request, and a bearer token still gets `403 session_required`. Run `go test ./...`.
- [x] 2.2 Add the `plan-week` workday rule and record the skill id on the turn's usage row. Verify a prompt-assembly test containing the workday numbers and the usage test showing the skill id. Run `go test ./...`.
- [x] 2.3 Send pasted text as an untrusted message part and wrap it server-side (D3). Verify a loop test that pasted text appears inside the untrusted envelope and counts toward the 256 KB limit. Run `go test ./...` and `npm test`.

## 3. Client

- [x] 3.1 Build `AskComposer` in `web/src/ui/patterns` (text area, Skills menu with menu semantics, example cards) with stories in light and dark. Verify `make ui-lint`, the a11y gate in `make ui-check`, and a happy-dom test for keyboard selection of a skill.
- [x] 3.2 Add the Skills menu to `AssistantPanel` and prefilled opening `{text, skill}` from anywhere, send `skill`, `workday` (from grid preferences) and pasted parts with the turn, and add "Break this down" to the task overflow menu. Verify happy-dom tests: choosing a skill prefills the panel, the request body carries skill and workday, and the task menu opens the panel with the task selected. Run `npm test` and `npm run build`.
- [x] 3.3 Show the composer on Today (top and empty state) only when the assistant is available, show the owner's dismissible hint when it's off, and nothing for members. Verify happy-dom tests for available, off as owner (dismiss persists on the device), off as member, and an encrypted account. Run `npm test` and `npm run build`.
- [x] 3.4 Add the Ask screen (`/ask`, sidebar entry when available, `g` then `k` in the shortcut table) with the full skill list and the unavailable explanation. Verify happy-dom tests for the shortcut and the encrypted-account message, `make layout-check` for the new screen at phone widths, `npm test` and `npm run build`.

## 4. MCP prompts

- [x] 4.1 Add `prompts/list` and `prompts/get` to `internal/mcp`, advertise `prompts` in `initialize`, return `-32602` for unknown names, and keep authentication unchanged (D5). Verify MCP tests for initialize, list, get with and without `text`, an unknown name, and an unauthenticated request. Run `go test ./...`.

## 5. Docs and integration

- [x] 5.1 Document skills, the composer, the Ask screen and pasted text in `docs/assistant.md`, prompts in `docs/mcp.md`, and the shortcut through the generated keyboard guide. Verify `make docs` and `make docs-check` pass.
- [ ] 5.2 Manually review each skill with the default Anthropic model and one small local model on the demo data, and adjust the instructions. Verify each skill produces a proposal or answer of the defined shape on the demo account. (Needs a provider key and a local model; not run in the implementing session.)
- [x] 5.3 Add a CHANGELOG entry under Unreleased and run `make check`. Verify it passes, including `openspec validate --all --strict`.
