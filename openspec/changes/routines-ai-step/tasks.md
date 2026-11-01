# Tasks

Prerequisites: `routines-engine` and `routines-editor` are merged.

## 1. AI steps

- [x] 1.1 Step table: `ask_ai` and `summarise` (inputs, outputs, content, at most 3 per routine) in Go and TypeScript with vectors; availability `ai_not_configured` and `ai_no_consent`; verify `go test ./internal/ruleval/...` and `npm test`
- [x] 1.2 `internal/assistant`: a single-shot completion without tools for routine steps (fixed instructions, untrusted context, response checks, 60 s per call), usage tagged `routine`, allowance and own-key rules; verify `go test ./internal/assistant/...` with a stub provider (answer, refusal, cut-off, quota)
- [x] 1.3 Consent: the disclosure paragraph and version, `routines` on the consent record, the on-device disclosure; verify `go test ./internal/httpapi/...` (401; consent required for AI steps only) and a happy-dom test
- [x] 1.4 `rule.ai_apply` and `rule.ai_budget` in `internal/sync/ops.go`; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...`

## 2. Proposals and auto mode

- [x] 2.1 Migration `NNNN_routines_ai.sql`: `routine_proposals`, `rule_ai_usage`, `rule_state` fallback columns, `relay_devices.routines` and capabilities; verify `go test ./internal/store/...`
- [x] 2.2 `internal/rules`: proposal mode (plan, write nothing, body for plaintext accounts, outcome `proposal`), expiry after 7 days with the body deleted; verify `go test ./internal/rules/...` ("Friday evening", "Expired")
- [x] 2.3 Proposal routes (list, get, apply with items and re-check, dismiss) through `routes.handle` with `.DemoDenied()`; writes with device `rule:<rule-id>` recorded on the run; verify `go test ./internal/httpapi/...` (401, 403 for `agent` and `read` tokens, 409 `proposal_closed`, "Apply some", "Changed since")
- [x] 2.4 Auto mode: allowed writes check at save and run, 20 items, effective mode from `ai_apply`'s op time and the fallback; fallback on limit, disallowed write and two failures; verify `go test ./internal/rules/...` (each scenario of "Apply without asking" and "Automatic fallback to proposals")
- [x] 2.5 Agents: `forbidden_for_agents` for `ai_apply` in MCP `create_routine`/`update_routine`, the assistant planner drops it; verify `go test ./internal/agenttools/... ./internal/mcp/...`
- [x] 2.6 Daily budget per routine and token records on runs; verify `go test ./internal/rules/...` ("Budget reached")

## 3. Device runs

- [x] 3.1 TypeScript planner for every step kind, the step vectors extended to all kinds and run by both sides; verify `npm test` and `go test ./internal/ruleval/... ./internal/rules/...`
- [ ] 3.2 `internal/relay`: the `routine.run` request (ids only), the routines opt-in (unlocked device, recent confirmation, survives lock, ends at sign-out or encryption off), capabilities `routines` and `ai`; dispatch to the most recently active suitable device; verify `go test ./internal/relay/...`
- [ ] 3.3 Waiting: `waiting_device`, latest occurrence per routine, superseded, missed after 24 hours; verify `go test ./internal/rules/...` with a stepped clock
- [ ] 3.4 Commit and fail routes (`signedIn.SessionOnly().DemoDenied()`): bound to the device, `routine_changed`, `fallback`, `write_limit`, ciphertext ops applied with device `rule:<rule-id>`; verify `go test ./internal/httpapi/...` (401, 403 for another device and for bearer tokens, 409 twice, 400) and `policy_test.go`
- [ ] 3.5 `web/src/lib/relay.ts`: answer `routine.run` (decrypt, plan, AI through the on-device assistant, encrypt, commit), the running indicator and the recent runs list; Run now on the device in hand; verify `npm test` (a fake relay stream; the operations sent are ciphertext)
- [ ] 3.6 Encrypted-account proposals: device writes the envelope, any device decrypts and applies through commit; verify `npm test` with two simulated devices

## 4. Editor and Inbox

- [x] 4.1 AI cards, token estimate in previews (never calling the model), Test with the confirmation and real counts; verify happy-dom tests ("Estimate first")
- [x] 4.2 Apply without asking switch with reasons, the fallback notice, the budget field, 7-day usage; verify happy-dom tests
- [x] 4.3 Proposal review sheet (items, ticks, Written by AI, Apply, Dismiss, Undo toast), Inbox card and bell entries; auto runs shown even with successes hidden; verify happy-dom tests and `npm test`
- [ ] 4.4 Encrypted-account warning and opt-in, unavailable email and text webhooks; verify a happy-dom test
- [x] 4.5 Shortcuts in the review (`Enter`, `Escape`) in the registry; verify the conflict test with `npm test`
- [x] 4.6 Strings in the six catalogs; verify `make i18n-check`

## 5. Checks

- [ ] 5.1 Bundle: the device runner lazy; verify `make bundle-budget`
- [ ] 5.2 `docs/automations.md` (AI steps, proposals, auto mode and its limits, budget, encrypted accounts), `docs/assistant.md`, `docs/encryption.md`, `docs/mcp.md` (agents cannot turn on auto mode); verify `make docs-check`
- [ ] 5.3 CHANGELOG Unreleased entry (at archive); `go test ./...`, `npm test`, `npm run build`, `make check`, `make openspec-validate`
