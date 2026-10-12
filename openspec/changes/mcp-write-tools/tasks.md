# Tasks

## 1. Scope, switches and storage

- [x] 1.1 Migration creating `api_token_agent` and `user_agent_access` (idempotent, `CREATE TABLE IF NOT EXISTS`). Verify `TestMigrationAgentTablesIdempotent` (runs twice on a database at the previous version) and `TestAgentTokenIsReadForOldBinaries` (an `agent` token has a `read` row) with `go test ./...`
- [x] 1.2 `internal/auth`: `ScopeAgent`, `CreateTokenScoped` accepts `agent`, `UserByTokenScope` reports it, `token.created` records `token_scope: agent`. `requireAuth` refuses `agent` on every write route like `read`. Verify `TestAgentTokenRefusedOnRestWrites` (tokens, settings, sync, tasks), `TestCreateAgentToken`, `TestInvalidScope400` with `go test ./...`
- [x] 1.3 `GET/PUT /api/v1/me/agent-access` (session or `full` token, `settings.changed` audit with `agent.writes`) and `writes_enabled` on `GET/PUT /api/v1/settings/mcp` with the optional `OPENTODO_MCP_WRITES` preset. Verify `TestAgentAccessRoute` (200, 401, 403 `insufficient_scope` for agent and read tokens, 400 `invalid_input`), `TestMcpWritesOwnerOnly`, `TestMcpWritesPresetSeedsOnce` with `go test ./...`
- [x] 1.4 Demo deny list: add `/api/v1/me/agent-access` to `demoRules`. Verify `TestDemoRefusesAgentAccess` and the existing `/mcp` demo test with `go test ./...`

## 2. Agent tool registry

- [x] 2.1 Create `internal/agenttools` with `Definition`, `Kind`, `ContentFields`, `Plan` and `ChangeSet {entity, entityId, patch, base}`, and move the five read tools into it with no behaviour change. Verify the existing `internal/mcp` tests and a new golden `TestToolsListReadOnlyUnchanged` (byte-identical to today's `tools/list`) with `go test ./...`
- [x] 2.2 Schema subset checker: every definition has `additionalProperties: false`, explicit types and bounded arrays. Verify `TestDefinitionsUseStrictSubset` with `go test ./...`
- [x] 2.3 Untrusted-content wrapping and provenance flags (`untrusted_text`, `_notice`, `shared`, `author_is_you`) in every read result. Verify `TestResultsMarkUntrustedText` with an injected comment fixture, using `go test ./...`

## 3. Write tools

- [x] 3.1 `create_tasks`, `update_tasks`, `create_project`, `create_label`, `add_comment` plan ChangeSets with validation shared with REST (field schema, limits, project and section existence, `client_request_id` derived ids). Verify `TestCreateTasksPlan`, `TestCreateIdempotentRequestID`, `TestUpdateTasksRejectsUnknownField` with `go test ./...`
- [x] 3.2 `complete_tasks` and `reopen_tasks` reuse the REST recurrence path (extract from `internal/httpapi/recurring.go` into a callable function). Verify `TestAgentCompleteRecurringConvergesWithDevice` (the same occurrence completed offline on a device gives one record) with `go test ./...`
- [x] 3.3 `move_tasks` and `schedule_tasks` (keep the time unless given, keep zoned dues) and `trash_tasks` restricted to tasks whose creation op carries the same token's device. Verify `TestScheduleKeepsTime`, `TestTrashOnlyOwnCreations` with `go test ./...`
- [x] 3.4 `add_comment` from an agent sends no mention notification. Verify `TestAgentCommentNoMention` with a recording `notify.MentionSink` and `go test ./...`

## 4. MCP integration

- [x] 4.1 Per-request `tools/list` with the permission gate (owner switch, user switch, `agent` scope, E2EE). Golden files for `read` token, `full` token, `agent` token with switches off, `agent` with switches on, and `agent` with an encrypted account. Verify `TestToolsListByPermission` with `go test ./...`
- [x] 4.2 `tools/call` of a write tool: gate errors (`writes_disabled_by_owner`, `writes_disabled_by_user`, `token_scope`), then `ApplyStrict` with device `agent:<token-id>` and `NotifyApplied`. Verify `TestAgentWriteAppliesThroughOpLog` (ops in the log with that device, an SSE wake-up observed), `TestAgentWriteBatchRefusedOnViewerScope`, `TestAgentWriteConvergesWithOfflineEdit` with `go test ./...`
- [x] 4.3 Limits: 50 entities per call, 30 calls per minute and 1,000 entities per day per token, `rate_limited` with `retry_after_seconds`. Verify `TestWriteLimitPerCall`, `TestWriteRatePerMinute` and `TestWriteDailyEntities` with a fake clock and `go test ./...`
- [x] 4.4 E2EE: content tools omitted, content fields refused with `encryption_enabled`, structural tools work. Verify `TestEncryptedAccountWriteRules` (no op written on refusal, no ciphertext in results) with `go test ./...`
- [x] 4.5 `/api/v1/sync` refuses ops whose device starts with `agent:` or `caldav:`. Verify `TestSyncRefusesReservedDevicePrefixes` with `go test ./...`
- [x] 4.6 Audit `agent.write` for success and refusal with allow-listed details only. Verify `TestAgentWriteAudited` and the existing `TestAuditDetailsAllowList` extended with the new keys, using `go test ./...`

## 5. History and web app

- [x] 5.1 History route adds `device_label` for `agent:` devices (token name only for the token's owner). Verify `TestHistoryAgentLabel` (owner sees the name, another member sees the generic label) with `go test ./...`
- [x] 5.2 `web/src/lib/history.ts` uses `device_label`. Token dialog gains the `agent` scope. The token list labels it "assistant, can make changes". Verify `history.test.ts` and `tokens.test.tsx` with `npm test` and `npm run build` in `web/`
- [x] 5.3 Settings → AI assistants: owner write switch, user switch, agent token shortcut shown only when both are on, offline state. Verify `assistantsSettings.test.tsx` with `npm test` and `npm run build` in `web/`, and check keyboard reachability in the browser

## 6. CLI, docs and release

- [x] 6.1 `ot token create --scope full|read|agent` (local validation, exit 2 on an unknown scope) and the scope column in `ot token list`. Verify `TestTokenCreateScope` in `internal/cli` with `go test ./...`
- [x] 6.2 Docs: `docs/mcp.md` (write tools, the three conditions, limits, undo, the threat model in plain words, E2EE behaviour), `docs/api.md` (scope `agent`, `/api/v1/me/agent-access`, `writes_enabled`), `docs/cli.md`. Verify `make docs` builds and the examples run against `./bin/opentodo` with a curl JSON-RPC session (create, schedule, complete, trash own task) and no 5xx in the logs
- [x] 6.3 After PR #11 (`ot mcp`) has merged: let the bridge accept `agent` tokens behind an explicit `--allow-agent-token` flag. Verify a `TestMCPBridgeAgentToken` case with `go test ./...`. Skip and note it in the PR if #11 is still open. **Skipped: PR #11 is still open (checked 2026-10-12); recorded in design.md "Implementation notes" as a follow-up for whichever change lands second.**
- [x] 6.4 Measure binary and web bundle sizes against the baseline in design.md and record them in design.md "Implementation notes". Update `ROADMAP.md` (mark `mcp-write-tools` shipped) and add a `CHANGELOG.md` Unreleased entry. Verify `make check` passes
