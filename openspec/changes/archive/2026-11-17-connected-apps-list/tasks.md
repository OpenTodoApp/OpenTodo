# Tasks

## 1. Server

- [x] 1.1 `Store.ConnectedGrants` and the two routes with their policies, the demo deny-list entry and the pinned policies in `policy_test.go`; `TestConnectedAppsListAndDisconnect`, `TestConnectedAppsDemo`, `TestConnectedAppsRefuseReadAndAgentTokens` (`go test ./internal/httpapi/...`).
- [x] 1.2 `DELETE /api/v1/tokens/{id}` ends the grant of a connected app's access token; `TestDeletingTheAccessTokenEndsTheGrant`.
- [x] 1.3 Audit event `mcp_oauth.disconnected` with allow-listed details (`go test ./internal/audit/...`), in the web's event names and labels.
- [x] 1.4 `docs/api.md` routes and audit table; the list recorded in `openapi_record_test.go`; `UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription`; `go test ./internal/httpapi -run TestV1SurfaceIsAdditive -update`.

## 2. Web

- [x] 2.1 `ConnectedApps` in the Session card with Disconnect and a confirmation; `web/src/app/connectedApps.test.tsx` (`npx vitest run`), `npm run -s typecheck`, `npm run build` and the bundle budget.
- [x] 2.2 Strings in every catalog (`node scripts/i18n/extract.mjs --write`, `node scripts/i18n-check.mjs`).

## 3. Docs

- [x] 3.1 `docs/mcp-oauth.md` (Ending access) and `docs/ai-and-agents.md`; `make docs`, `make docs-check`; changelog fragment `changelog.d/Security/connected-apps-list.md`; `make openspec-validate`.
