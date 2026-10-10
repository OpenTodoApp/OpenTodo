# Tasks

## 1. Token scope and settings

- [ ] 1.1 Migration adding `api_tokens.scope` (default `full`) and `settings` if absent; verify `TestMigrationTokenScopeDefaultsFull` on a database at the previous version (`go test ./...`)
- [ ] 1.2 `internal/auth`: create tokens with `scope` (`full|read`), list shows scope; `requireAuth` refuses `read` tokens on write routes and `/api/v1/sync` with 403 `insufficient_scope`; verify `TestReadTokenRefusedOnWrites`, `TestLegacyTokensKeepFullAccess`, `TestReadTokenAllowedOnReads` (`go test ./...`)
- [ ] 1.3 Owner-only `GET/PUT /api/v1/settings/mcp`, `OPENTODO_MCP` preset in `internal/config`, in-memory cache invalidated on write; verify `TestMcpSettingForbidsMembers`, `TestMcpPresetSeedsOnce` (`go test ./...`)

## 2. MCP protocol core

- [ ] 2.1 `internal/mcp`: JSON-RPC 2.0 request/notification/batch parsing and error codes (-32700, -32600, -32601, -32602), `initialize` with version negotiation and capabilities (`tools`, `resources`, no `prompts`), `ping`, `notifications/initialized`; verify `TestInitializeNegotiatesVersion`, `TestUnknownMethod32601`, `TestMalformedJSON32700` (`go test ./...`)
- [ ] 2.2 Mount `POST /mcp` (404 while disabled, bearer-only auth with `WWW-Authenticate: Bearer`, cookies ignored, rate-limited failures, Origin check, 1 MB body cap, `GET` → 405, SSE-only `Accept` → 406); verify `TestMcpDisabled404`, `TestMcpCookieRejected401`, `TestMcpBadOrigin403`, `TestMcpBodyTooLarge413`, `TestMcpGet405` (`go test ./...`)
- [ ] 2.3 Debug logging of method and duration only; verify `TestMcpLogsNoArguments` asserts the log line contains neither arguments nor results (`go test ./...`)

## 3. Tools and resources

- [ ] 3.1 `tools/list` with JSON schemas and `readOnlyHint` annotations; `list_projects`, `get_task`; verify `TestToolsListShape` (golden file) and `TestGetTaskExcludesDeleted` (`go test ./...`)
- [ ] 3.2 `list_tasks` with view, project, label, priority, due range, completion, `timezone`, `limit` clamp 200 and opaque cursor; verify `TestListTasksTodayInTimezone`, `TestListTasksPaging450`, `TestListTasksInvalidPriority32602` (`go test ./...`)
- [ ] 3.3 `search_tasks` (case-insensitive title/description) and `today_summary`; verify `TestSearchTasks`, `TestTodaySummaryCounts` (`go test ./...`)
- [ ] 3.4 `resources/list`, `resources/templates/list`, `resources/read` for projects, project by id, task by id and views with optional `?tz=`; foreign or deleted → `-32002`; verify `TestResourcesListShape`, `TestReadForeignTask32002SameAsDeleted` (`go test ./...`)
- [ ] 3.5 Per-user isolation and no-write guarantee: run every tool and resource against a store with two users and assert the op log and `fields` are byte-identical before and after; verify `TestMcpIsReadOnlyAndIsolated` (`go test ./...`)
- [ ] 3.6 Conformance fixtures recorded from two MCP clients (a desktop assistant and a CLI inspector) replayed in `TestClientFixtures` (`go test ./...`)

## 4. Web app

- [ ] 4.1 Token creation dialog gains a scope choice; token list shows scope; verify `tokens.test.tsx` (`npm test`, `npm run build`)
- [ ] 4.2 Settings → AI assistants: owner toggle with status, endpoint URL with copy, "create read-only token" shortcut, connection instructions, member view without toggle, offline state with disabled actions; verify `assistantsSettings.test.tsx` (`npm test`) and keyboard reachability in the browser flow

## 5. Docs and integration

- [ ] 5.1 `docs/mcp.md`: enable, create a read token, connect from an assistant (URL + bearer header), tool and resource reference with example results, limits, time-zone note, security notes; `docs/api.md`: token scope and the setting route; verify examples against `./bin/opentodo` with an MCP inspector session that lists tools, calls `today_summary` and reads a resource with no 5xx in logs
- [ ] 5.2 README feature list, `ROADMAP.md` status, `CHANGELOG.md` Unreleased; verify links resolve and `make check` passes
