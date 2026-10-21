## 0. Before building

- [x] 0.1 Security review of design D1, D6 and D8 and of the trust-model wording; record the outcome in design.md (verify: review notes linked from design.md, open questions 1–3 answered) — [security-review.md](security-review.md), design D11 adds R1–R6, Open Questions answered
- [ ] 0.2 Confirm `mcp-projects` is archived (local `ot mcp` exists) (verify: `openspec list` no longer shows it) — open: `mcp-projects` is merged (#205) and `ot mcp --decrypt` exists, but the change is not archived yet (its 6.3 waits for `time-tracking`). Archive `mcp-projects` before this change: both modify "Encrypted accounts and write tools", and this delta already carries the `mcp-projects` scenarios

## 1. Server: opt-in and relay channel

- [x] 1.1 Migration `NNNN_relay_devices.sql` with `relay_devices(user_id, device_id, label, enabled_at)` (verify: `go test ./internal/store/...` applies it on a fresh and an existing database) — `0040_relay_devices.sql`, with `session_hash` (review R2); `go test ./internal/store/...` passes
- [x] 1.2 Opt-in/opt-out routes through `routes.handle` with `signedIn().sessionOnly().recent().demoDenied()` and a matching entry in `internal/httpapi/demo.go`; 409 `not_encrypted` for unencrypted accounts (verify: `go test ./internal/httpapi/... -run Relay` covers 401, stale confirmation, demo 403, 409, success; `policy_test.go` passes) — `TestRelayRoutesAuthAndConflicts`; the demo deny list and policy tests pass (`/api/v1/relay` prefix, every method)
- [x] 1.3 Relay stream `GET /api/v1/relay/events` (SSE) and answer route `POST /api/v1/relay/answers/{id}`, one-shot and device-bound; in-memory hub with 4 queued per account and ten streams per account (verify: tests for wrong device → 404, second answer → 404, unauthenticated stream → 401; sync events stream test still asserts no content) — `internal/relay` hub tests, `TestRelayAnswerFromAnotherSession` (another session: stream 403, answer 404), `TestRelayEndToEndNoPlaintextLeft` (second answer 404); the sync events tests are unchanged and pass
- [x] 1.4 Clear opt-ins on lock, sign-out and encryption off; audit `relay.enabled` / `relay.disabled` with reason (verify: `go test ./internal/audit/... ./internal/httpapi/... -run Relay`) — `TestRelayEndsWithEncryptionAndOnLock`, sign-out in `TestRelayEndToEndNoPlaintextLeft`

## 2. Server: tools through the relay

- [x] 2.1 In `internal/agenttools`, replace the unconditional `encryption_enabled` refusal with "relay if an opted-in device exists, else refuse"; `tools/list` lists content tools when a device is opted in (verify: registry tests for both cases) — `TestRelayedToolListIsPlain`, `TestRelayedWriteStoresDeviceCiphertext` (with and without a relay)
- [x] 2.2 Decrypt hook on result rendering and encrypt hook on content arguments before planning; ops carry device-made ciphertext (verify: test with a fake device answering via the hub; the written op values are ciphertext; `ApplyStrict` + `NotifyApplied` unchanged) — reads mark ciphertext while loading and decrypt only what the result shows (R6); writes encrypt the planned ops' values with their entity, id and field. `TestRelayedReadDecryptsOnlyWhatIsShown`, `TestRelayedWriteStoresDeviceCiphertext`, end to end in `TestRelayEndToEndNoPlaintextLeft`
- [x] 2.3 Errors `device_unavailable`, `device_timeout` (20 s read / 30 s write), `device_busy`, `device_limit`, `declined_on_device`; no cross-device retry for writes (verify: table test per error; nothing written in each case) — `TestRelayErrorsWriteNothing`, `TestRelayErrors`
- [x] 2.4 Server limits: 60 relayed requests/min/account, 2,000 values and 2 MB per request, after MCP limits (verify: test the 61st call returns `rate_limited` with `retry_after_seconds`) — `TestRelayMinuteLimitAndQueue`, `TestRelayErrors` (too many values)
- [x] 2.5 No relayed plaintext in DB, logs or audit: a test that relays a known title and greps the database file, captured logs and audit export for it (verify: `go test ./internal/... -run RelayNoPlaintext`) — `TestRelayEndToEndNoPlaintextLeft` reads the database and its WAL (and checks it sees the stored ciphertext), every audit event and the captured server log

## 3. Web app: relay worker and settings

- [x] 3.1 Relay worker in the syncing tab (the existing browser lock): opens the relay stream when opted in and unlocked, decrypts/encrypts with the account key, answers by id (verify: `npm test` in web/ with a fake stream; stops on lock) — `web/src/lib/relay.ts` (`onLeadership` in sync.ts); `relay.test.ts`: the shared Go/WebCrypto vector `relay.vectors.json`, answering, and lock → opt-out with reason `locked`
- [x] 3.2 Local caps (5,000/hour, 20,000/day), recent-calls list without values, "Stop relaying" (verify: unit tests for the caps returning `device_limit`) — caps persisted in IndexedDB meta and counting both directions (R4, R5); the switch is the one-action stop
- [x] 3.3 Settings → Assistants: the opt-in switch with the plain-words trust note, the list of opted-in devices, the "Ask me before AI connectors change anything" option (verify: story + a11y gate; `npm run build`) — `RelaySettings.tsx`, stories `Settings/AI/Relay*`; a11y gate: 5 stories × 2 themes, no serious or critical violations
- [x] 3.4 Confirmation sheet for relayed writes reusing the assistant's review sheet; Decline answers `declined_on_device` (verify: interaction test) — a dedicated sheet (`RelayConfirm.tsx`): the device receives the text to encrypt, not a change set, so the assistant's sheet does not fit; `relay.test.tsx` covers Decline, Apply and "reads never ask"
- [x] 3.5 Relay indicator in the sidebar footer while a request runs, within the interface budget (no new chrome row) (verify: layout check passes; story) — `RelayIndicator` in the footer row, story `RelayIndicatorBusy`; it renders only while a request runs, so the layout check's screens never show it

## 4. Docs and checks

- [x] 4.1 docs/e2ee.md and docs/mcp.md: what the relay is, the trust model, how to opt in, errors and limits; translations in all catalogs (verify: `make docs-check`, `node scripts/i18n-check.mjs`) — plus docs/api.md (routes and audit events), AGENTS.md and docs/architecture.md (`internal/relay`)
- [x] 4.2 `make check` passes; CHANGELOG entry under Unreleased
