# Tasks

## 1. Storage and identity

- [ ] 1.1 Migration `NNNN_agent_call_undos.sql` (idempotent `IF NOT EXISTS`): partial index `ops_agent_calls ON ops(user_id, ts) WHERE device >= 'agent:' AND device < 'agent;'` and table `agent_call_undos` (design D9). Verify `TestMigrationAgentCallUndosIdempotent` (runs twice on a database at the previous version) and `TestAgentCallQueryUsesIndex` (`EXPLAIN QUERY PLAN` names `ops_agent_calls`) with `go test ./...`
- [ ] 1.2 `internal/sync`: `AgentUndoDevicePrefix = "agent-undo:"`, `AgentUndoDevice(tokenID)`, added to `ReservedDevice`, not matched by `IsAgentDevice`. Verify `TestSyncRefusesReservedDevicePrefixes` extended with `agent-undo:abc` (400 `invalid_op`, nothing applied) and `TestTrashOwnCreationsIgnoresUndoDevice` with `go test ./...`
- [ ] 1.3 `agenttools.Registry` seeds `lastTS` from the highest agent op timestamp at start-up (D1). Verify `TestAgentTSMonotonicAcrossRestart` (fake clock stepped back between two registries on one database; two calls never share a timestamp) with `go test ./...`
- [ ] 1.4 `sync.FieldDefault` (unset values of structural fields) with a parity test against the defaults in `web/src/lib/ops.ts` through a shared JSON fixture. Verify `TestFieldDefaultsMatchClient` with `go test ./...` and `ops.defaults.test.ts` with `npm test` in `web/`

## 2. Listing calls

- [ ] 2.1 `agenttools.ListCalls(ctx, userID, tokenID, before, limit)` groups agent ops by `(device, ts)` within 30 days and derives counts (created, changed, completed, reopened, trashed, comments) and project ids. Verify `TestListCallsGroupsByCall` (MCP call, REST `CallAll` combined call with two tools = one entry, relative-reminder ops counted with their task, 31-day-old call left out, other user's calls invisible) with `go test ./...`
- [ ] 2.2 `agent.write` gets the additive allow-listed `call` detail (`<token-id>.<ts>`); the list joins tools from retained events and token names from `api_tokens`, then the event, then "deleted token". Verify `TestAgentWriteAuditCallDetail`, `TestAuditDetailsAllowList` extended, and `TestListCallsAfterRevokeAndAuditPrune` with `go test ./...`
- [ ] 2.3 `GET /api/v1/me/agent-calls` (session or `full` token; `read` and `agent` 403 `insufficient_scope`; 401 anonymous; 400 `invalid_input` for a bad cursor or limit; names through `e2ee.Display`). Verify `TestAgentCallsRoute` covering each status with `go test ./...`

## 3. Undo planning and apply

- [ ] 3.1 Field-winner and previous-value lookups in `internal/sync` (current `scope_fields` clock; LWW winner among the field's ops in the entity's scope excluding a set of clocks). Verify `TestPreviousValueExcludingCalls` (overlapping calls A, user edit, B: undo B restores the user's value, undo A skips, undo A+B restores the user's value; a lost op is never restored) with `go test ./...`
- [ ] 3.2 `agenttools.PlanUndo` per design D3: restore fields, trash created entities (skipped when referenced or edited since), restore trashed tasks (Inbox when the project is trashed), comment tombstones, recurring completion, relative-reminder `fire_at`, skip reasons `changed_since`, `already_undone`, `forbidden`, `not_accessible`, `purged`, `history_unavailable`, `encrypted`. Verify table-driven `TestPlanUndo` with one case per tool (`create_tasks`, `update_tasks`, `complete_tasks` incl. recurring, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `create_label`, `add_comment`, `trash_tasks`) with `go test ./...`
- [ ] 3.3 Apply as one `ApplyStrict` batch with device `agent-undo:<token-id>` and the REST clock, `NotifyApplied`, per-user mutex, refused-op retry (at most 3, then 409 `conflict`), `agent_call_undos` rows. Verify `TestUndoAppliesOneBatch` (one timestamp, SSE wake-up observed, webhooks fired once per entity) and `TestUndoRetriesAfterRoleChangeMidRequest` with `go test ./...`
- [ ] 3.4 Concurrent edits: a device edit synced before the undo is skipped; a later-timestamped offline edit wins after sync; an earlier offline edit synced afterwards loses but stays in history. Verify `TestUndoSkipsLaterEdit`, `TestUndoConvergesWithOfflineEdits` (two simulated devices, both orders of arrival, identical final state) with `go test ./...`
- [ ] 3.5 Shared projects: editor at call time, viewer at undo time → `forbidden` skip without refusing the batch; removed member → `not_accessible`; another member's later edit → `changed_since`; another member sees "Undo of AI assistant". Verify `TestUndoSharedProjectRoles` with `go test ./...`
- [ ] 3.6 E2EE: structural restore works, no content op written, plaintext into a content field skipped `encrypted`, purged plaintext history gives `history_unavailable`. Verify `TestUndoEncryptedAccount` (all stored values of content fields remain ciphertext) with `go test ./...`
- [ ] 3.7 Idempotency: second undo writes zero ops and reports `already_undone`; crash between commit and `agent_call_undos` insert reconciles. Verify `TestUndoTwiceWritesNothing` and `TestUndoStatusReconciles` with `go test ./...`

## 4. Undo route, limits, audit, demo

- [ ] 4.1 `POST /api/v1/me/agent-calls/undo` with `{calls:[…]}` or `{token_id, since}` and `dry_run`; 401, 403 `insufficient_scope` (read and agent tokens), 400 `invalid_input`, 404 `not_found` for unknown or foreign call ids, 400 `too_many_items` (>100 calls or >500 items), 429 `rate_limited` with `Retry-After` (11th request per minute). Verify `TestAgentUndoRoute` covering each status and `TestAgentUndoDryRunWritesNothing` with `go test ./...`
- [ ] 4.2 No undo tool in the registry and no agent REST route: verify the `tools/list` golden files are unchanged and `TestAgentTokenRefusedOnUndo` with `go test ./...`
- [ ] 4.3 Audit `agent.undo` (token id and name, calls, restored, skipped, outcome; no content), included in personal activity names. Verify `TestAgentUndoAudited` and the audit catalogue test with `go test ./...`
- [ ] 4.4 Demo deny rule `prefix("/api/v1/me/agent-calls")`. Verify `TestDemoRefusesAgentUndo` (GET and POST, 403 `demo_restricted` before auth) with `go test ./...`
- [ ] 4.5 Daily prune of `agent_call_undos` rows older than the window and deletion with the user. Verify `TestAgentCallUndosPruned` and `TestDeleteUserRemovesAgentCallUndos` with `go test ./...`

## 5. History

- [ ] 5.1 History route: `device_label` "Undo of AI assistant (<name>)" / "Undo of AI assistant" for `agent-undo:` devices, and additive `call_id` on `agent:` change sets the viewer owns. Verify `TestHistoryAgentUndoLabel` and `TestHistoryCallIDOnlyForOwner` with `go test ./...`
- [ ] 5.2 `web/src/lib/history.ts`: label fallback for `agent-undo:` and the "Undo this assistant change" action when `call_id` is present. Verify `history.test.ts` with `npm test` and `npm run build` in `web/`

## 6. Web app

- [ ] 6.1 `web/src/lib/api.ts`: `listAgentCalls`, `undoAgentCalls` (dry run and apply). Verify `agentCalls.test.ts` (request shapes, error mapping for 403/404/429/400) with `npm test` in `web/`
- [ ] 6.2 `AssistantsPanel.tsx`: "Recent changes by assistants" grouped by token, Undo per call, "Undo all from this assistant…" with period choice, preview dialog naming items from local data (decrypted names for encrypted accounts), result toast, offline state. Verify `AgentChangesPanel.test.ts` (preview then confirm, skipped items named, offline disables actions, keyboard: Tab order and Esc closes the dialog) with `npm test` and `npm run build` in `web/`
- [ ] 6.3 Layout check: add the panel and the preview dialog to the screens of `scripts/e2e-layout.mjs` (seeded with agent calls). Verify `make layout-check` passes at 360/390/768 px

## 7. Docs and release

- [ ] 7.1 `docs/mcp.md` "History, audit and undo": one-step undo, skip rules, window and limits, offline behaviour, encrypted accounts; `docs/ai-and-agents.md` "What every option has in common": undo for every option (in-app per device, MCP/CLI on the server); `docs/trash-and-history.md`: the new label and history action. Verify `make docs-check`
- [ ] 7.2 `docs/api.md`: both routes with request and response examples and error codes under "Agent tokens"; audit catalogue gains `agent.undo`. Verify `make docs-check`
- [ ] 7.3 `ROADMAP.md` row 4 `agent-batch-undo` in "Bring your agent"; CHANGELOG entry under Unreleased at archive time. Verify `npx @fission-ai/openspec validate --all --strict`
- [ ] 7.4 Report the measured binary and main-chunk size deltas against design "Size and memory", then run `make check`. Verify `make check` passes
