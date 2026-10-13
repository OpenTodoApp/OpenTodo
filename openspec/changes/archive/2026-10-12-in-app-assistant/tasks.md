# Tasks

Depends on `mcp-write-tools` (the `internal/agenttools` registry with `Plan`/`ChangeSet`, limits, untrusted-text marking, the history label requirement) being applied first.

## 1. Configuration, keys and storage

- [x] 1.1 Migration for `assistant_usage` and `assistant_consent` (idempotent). Verify `TestMigrationAssistantTables` on a database at the previous version with `go test ./...`
- [x] 1.2 `internal/assistant` settings (settings key `assistant`, defaults off) and `secrets/assistant.json` through `settings.SecretsFile` (operator and per-user keys, presence flags only). Deleting a user removes their keys. Verify `TestAssistantSecretsNeverSerialised` (JSON, slog, `%v`), `TestBackupExcludesAssistantSecrets`, `TestUserDeletionRemovesOwnKeys` with `go test ./...`
- [x] 1.3 `GET/PUT /api/v1/settings/assistant` (owner writes, member status view, validation, `settings.changed` audit with `set`/`unset` for keys). Verify `TestAssistantSettingsRoute` (200 owner, 403 member, 401 anonymous, 400 invalid, key never returned) with `go test ./...`
- [x] 1.4 `GET/PUT /api/v1/me/assistant` (consent with disclosure version and provider, own key only when allowed) and `GET /api/v1/me/assistant/usage`. Verify `TestAssistantConsentRoute` (401, 403 own key not allowed, re-consent after a provider change) and `TestAssistantUsageRoute` with `go test ./...`
- [x] 1.5 Demo deny rules for `/api/v1/assistant` and `/api/v1/me/assistant`. Verify `TestDemoRefusesAssistant` with `go test ./...`

## 2. Providers and network policy

- [x] 2.1 Provider interface and Anthropic adapter on `github.com/anthropics/anthropic-sdk-go` (Messages API, streaming with `Accumulate`, `strict: true` tools from the registry, `tool_choice` auto only, thinking omitted or adaptive and never disabled, default model `claude-opus-5-5`). Verify `TestAnthropicRequestShape` against a recorded `httptest` server (asserts `tool_choice.type == "auto"`, strict tools, no disabled thinking, `stream: true`) with `go test ./...`
- [x] 2.2 Chat Completions adapter on the standard library for OpenAI, Gemini (Google's OpenAI-compatible base URL) and custom endpoints, with streaming, `include_usage`, tool calls and `finish_reason` mapping. Verify `TestCompatibleAdapterStreamsToolCalls` and `TestCompatibleFinishReasonMapping` with `httptest` and `go test ./...`
- [x] 2.3 Network policy: reuse the `internal/webhook` address checks for the compatible base URL at save time and per connection, connect to the checked address, no redirects, the owner's private-endpoint switch. Verify `TestAssistantPrivateEndpointRefused`, `TestAssistantRebindingRefused`, `TestAssistantNoRedirects` with `go test ./...`
- [x] 2.4 "Test connection" (owner only, minimal request, detects missing tool support). Verify `TestTestConnectionDetectsNoTools` with `go test ./...`
- [x] 2.5 Network audit: with the assistant disabled, run the server test suite's full flow with an outbound-request recorder. Verify `TestNoProviderTrafficWhenDisabled` with `go test ./...`

## 3. Agent loop and turn route

- [x] 3.1 Loop: read tools over materialised state, write tools `Plan` only into a turn draft with overlay, a 50-entity cap with a split message, at most 8 rounds, fixed system prompt with date, time zone and untrusted-data rule. Verify `TestLoopProposesWithoutWriting` (op log byte-identical before and after), `TestLoopCapsChangeSetAt50`, `TestLoopRoundLimit` with a scripted fake provider and `go test ./...`
- [x] 3.2 Stop-reason handling: `end_turn`, `tool_use`, `max_tokens` (cut off, no change set), `refusal` (fixed message, no partial content, no change set), `pause_turn`, unknown values. Verify `TestStopReasons` with the fake provider and `go test ./...`
- [x] 3.3 `POST /api/v1/assistant/turn`: session only (403 `session_required`), consent (403), E2EE (409 `encryption_enabled`), quota (429 `assistant_quota`), size (413), one turn per user (409), server cap of 8 (503), SSE events. Verify `TestTurnRouteGuards` (each status) and `TestTurnStreamsEvents` with `go test ./...`
- [x] 3.4 Usage accounting from provider usage events, monthly rollover in UTC. Logs hold method, duration and token counts only. Verify `TestUsageRecordedPerTurn`, `TestQuotaResetsMonthly` and `TestAssistantLogsNoContent` with `go test ./...`
- [x] 3.5 Injection fixture: a task whose description carries instructions, plus a scripted provider that obeys them. The resulting change set never contains out-of-registry actions, and the review marks shared items. Verify `TestInjectionCannotEscapeRegistry` with `go test ./...`

## 4. Client data layer

- [x] 4.1 `mutateMany(changes, {origin: 'assistant'})` stamps device `assistant:<device-id>`. `/api/v1/sync` accepts that prefix. History label "Assistant". Verify `ops.test.ts` (device prefix) with `npm test`, and `TestSyncAcceptsAssistantPrefix` plus `TestHistoryAssistantLabel` with `go test ./...`
- [x] 4.2 `web/src/lib/assistant.ts`: outbox flush before a turn, SSE stream parser on `fetch`, change-set stale detection against local `base`, apply, inverse batch in `assistantUndo` (last 20), undo that skips fields changed later. Verify `assistant.test.ts` (stale item unchecked, offline apply queues ops, undo restores values, undo skips a later hand edit) with fake-indexeddb, using `npm test` and `npm run build` in `web/`
- [x] 4.3 Dexie version bump with `assistantThreads` and `assistantUndo` (device-local, never in the outbox), retention of 30 days or 50 threads, cleared by `clearDeviceData()`. Verify `assistantStore.test.ts` (sign-out clears, no outbox entries) with `npm test`
- [x] 4.4 Auto-apply rule (at most 3 existing entities, allowed fields only, never creations or deletions, always an Undo toast), off by default per device. Verify `autoApply.test.ts` with `npm test`

## 5. UI

- [x] 5.1 Header button and the Shift+I shortcut, shown only when enabled for the user. Listed in `?` help. Check for clashes with the default and Vim keymaps. Verify `shortcutHelp.test.tsx`, `vim/dispatch.test.ts` with `npm test`
- [x] 5.2 Lazy `web/src/app/assistant/` chunk: panel on the overlay module (side sheet and phone sheet), composer, Markdown messages, polite live region updated at sentence boundaries, status region, offline state, encrypted-account explanation, demo notice. Verify `assistantPanel.test.tsx` (focus trap and return, live region updates, offline composer disabled, E2EE message) with `npm test` and `npm run build`. Check the 390 px layout and keyboard-only flow in the browser
- [x] 5.3 Change-set review (grouped items, words for changes, checkboxes, shared badge, Enter applies, Esc discards, summary "4 of 5 applied") and the Undo toast. Verify `changeSetReview.test.tsx` with `npm test`
- [x] 5.4 Consent step (provider name, field list, own key when allowed) and Settings → Assistant (owner: providers, keys, models, base URL, private endpoint, cap, member keys, Test connection; user: consent status, own key, usage, auto-apply, clear conversations). Verify `assistantSettings.test.tsx` and `assistantConsent.test.tsx` with `npm test` and `npm run build`

## 6. Docs, size and release

- [x] 6.1 `docs/assistant.md` (what it does, owner setup per provider including local models, what is sent and to whom, consent, safety model and injection in plain words, undo, costs and caps, E2EE note, demo), `docs/self-hosting` outbound targets, `docs/keyboard.md`. Verify `make docs` and a manual run against `./bin/opentodo` with a local compatible endpoint (or the fake provider in dev mode): ask, review, apply, undo, with no 5xx in the logs
- [x] 6.2 Measure the server binary (with the SDK), the container image and web chunks (main and assistant, gzipped) against the baselines in design.md D10, and record them in design.md "Implementation notes". Verify the numbers are reproduced by `make build` and `npm run build` output
- [x] 6.3 Update `ROADMAP.md` (mark `in-app-assistant` shipped) and add a `CHANGELOG.md` Unreleased entry. Verify `make check` passes
