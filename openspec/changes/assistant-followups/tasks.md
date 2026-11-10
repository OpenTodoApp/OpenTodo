# Tasks

- [x] 1.1 Display tool `suggest_followups` (schema, once per answer, not with `ask_choice`) on the server and the device. Verify with `internal/assistant` tests and `blocks.vectors.json`; run `go test ./...`.
- [x] 1.2 Chips under the latest answer; tapping sends; disabled offline and on older answers. Verify with happy-dom tests for both scenarios; run `npm test` and `npm run build`.
- [ ] 1.3 Strings, stories and an eval scenario. Verify with `make i18n-check`, `make ui-check` and a recorded eval run. Strings, stories and the scenarios `followups-overdue` and `fact-no-followups` are in; the recorded eval run waits for a provider key.
