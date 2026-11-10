# Tasks

- [x] 1.1 The four skills (instructions, tools, display tools) on the server and in the manifest, and MCP prompts. Verify with `internal/assistant` skills tests and the MCP prompts golden; run `go test ./...`.
- [x] 1.2 Menu entries in the task menu and panel, the project header and Today's overflow, shown only while the assistant is available. Verify with happy-dom tests for both scenarios in the first requirement; run `npm test` and `npm run build`.
- [ ] 1.3 Strings, docs (`assistant-skills.md`) and eval scenarios for `find-slot` and `brief-today`. Verify with `make i18n-check`, `make docs-check` and a recorded eval run. (Strings, docs and the two scenarios are done and pass `run.mjs --check`; the recorded run against a real provider is not, so this stays open.)
