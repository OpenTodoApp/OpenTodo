## 0. Before building

- [ ] 0.1 Security review of design D1, D6 and D8 and of the trust-model wording; record the outcome in design.md (verify: review notes linked from design.md, open questions 1–3 answered)
- [ ] 0.2 Confirm `mcp-projects` is archived (local `ot mcp` exists) (verify: `openspec list` no longer shows it)

## 1. Server: opt-in and relay channel

- [ ] 1.1 Migration `NNNN_relay_devices.sql` with `relay_devices(user_id, device_id, label, enabled_at)` (verify: `go test ./internal/store/...` applies it on a fresh and an existing database)
- [ ] 1.2 Opt-in/opt-out routes through `routes.handle` with `signedIn().sessionOnly().recent().demoDenied()` and a matching entry in `internal/httpapi/demo.go`; 409 `not_encrypted` for unencrypted accounts (verify: `go test ./internal/httpapi/... -run Relay` covers 401, stale confirmation, demo 403, 409, success; `policy_test.go` passes)
- [ ] 1.3 Relay stream `GET /api/v1/relay/events` (SSE) and answer route `POST /api/v1/relay/answers/{id}`, one-shot and device-bound; in-memory hub with 4 queued per account and ten streams per account (verify: tests for wrong device → 404, second answer → 404, unauthenticated stream → 401; sync events stream test still asserts no content)
- [ ] 1.4 Clear opt-ins on lock, sign-out and encryption off; audit `relay.enabled` / `relay.disabled` with reason (verify: `go test ./internal/audit/... ./internal/httpapi/... -run Relay`)

## 2. Server: tools through the relay

- [ ] 2.1 In `internal/agenttools`, replace the unconditional `encryption_enabled` refusal with "relay if an opted-in device exists, else refuse"; `tools/list` lists content tools when a device is opted in (verify: registry tests for both cases)
- [ ] 2.2 Decrypt hook on result rendering and encrypt hook on content arguments before planning; ops carry device-made ciphertext (verify: test with a fake device answering via the hub; the written op values are ciphertext; `ApplyStrict` + `NotifyApplied` unchanged)
- [ ] 2.3 Errors `device_unavailable`, `device_timeout` (20 s read / 30 s write), `device_busy`, `device_limit`, `declined_on_device`; no cross-device retry for writes (verify: table test per error; nothing written in each case)
- [ ] 2.4 Server limits: 60 relayed requests/min/account, 2,000 values and 2 MB per request, after MCP limits (verify: test the 61st call returns `rate_limited` with `retry_after_seconds`)
- [ ] 2.5 No relayed plaintext in DB, logs or audit: a test that relays a known title and greps the database file, captured logs and audit export for it (verify: `go test ./internal/... -run RelayNoPlaintext`)

## 3. Web app: relay worker and settings

- [ ] 3.1 Relay worker in the syncing tab (the existing browser lock): opens the relay stream when opted in and unlocked, decrypts/encrypts with the account key, answers by id (verify: `npm test` in web/ with a fake stream; stops on lock)
- [ ] 3.2 Local caps (5,000/hour, 20,000/day), recent-calls list without values, "Stop relaying" (verify: unit tests for the caps returning `device_limit`)
- [ ] 3.3 Settings → Assistants: the opt-in switch with the plain-words trust note, the list of opted-in devices, the "Ask me before AI connectors change anything" option (verify: story + a11y gate; `npm run build`)
- [ ] 3.4 Confirmation sheet for relayed writes reusing the assistant's review sheet; Decline answers `declined_on_device` (verify: interaction test)
- [ ] 3.5 Relay indicator in the sidebar footer while a request runs, within the interface budget (no new chrome row) (verify: layout check passes; story)

## 4. Docs and checks

- [ ] 4.1 docs/e2ee.md and docs/mcp.md: what the relay is, the trust model, how to opt in, errors and limits; translations in all catalogs (verify: `make docs-check`, `node scripts/i18n-check.mjs`)
- [ ] 4.2 `make check` passes; CHANGELOG entry under Unreleased
