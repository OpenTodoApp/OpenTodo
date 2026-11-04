# Tasks

## 1. Server

- [ ] 1.1 Migration `0057_mcp_oauth` adding `mcp_oauth_client`, `mcp_oauth_code` and `mcp_oauth_grant`; verify `go test ./internal/store/...`
- [ ] 1.2 `internal/mcpoauth`: client creation and lookup (hashed secret, constant-time compare), Google redirect matching, S256 verification, single-use codes with expiry, grants with a stable refresh token; verify `go test ./internal/mcpoauth/`
- [ ] 1.3 Routes in `internal/httpapi/mcp_oauth.go`: both well-known documents (plus the `/mcp` protected-resource variant), `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`, all off while MCP is off and demo-denied where credentials are issued; verify `go test ./internal/httpapi/ -run 'MCPOAuth|WellKnown'`
- [ ] 1.4 Owner client routes `GET`/`POST`/`DELETE /api/v1/settings/mcp/clients`, secret shown once; verify `go test ./internal/httpapi/ -run MCPOAuth`
- [ ] 1.5 `/mcp` 401 challenge names the protected-resource document; verify `go test ./internal/httpapi/ -run MCP`
- [ ] 1.6 Audit: `mcp_oauth.client_created`, `.client_deleted`, `.granted`, `.revoked` in the closed catalogue, naming ids only; verify `go test ./internal/audit/...`

## 2. Client

- [ ] 2.1 `web/src/lib/api.ts`: the four owner calls and their types; new error codes in `server-error-codes.json`
- [ ] 2.2 AI assistants card: client list, create form (name, read/agent, Google preset), secret shown once with a copy action, delete; the MCP address to paste into the client; verify `assistantMcpOAuth.test.tsx`
- [ ] 2.3 Strings in `messages.json` and the five catalogs; verify `make i18n-check`

## 3. Documentation and release

- [ ] 3.1 `docs/mcp-oauth.md`: what it is, connecting Gemini step by step, the manual client path, scopes, revocation; link it from `docs/mcp.md` and `docs/assistant-owner-options.md`; verify `make docs-check`
- [ ] 3.2 `docs/api.md` lists the discovery, OAuth and client routes with their errors
- [ ] 3.3 CHANGELOG entry under Unreleased (Added: OAuth for the MCP endpoint)
- [ ] 3.4 `go test ./...`, `cd web && npm test && npm run build`, `make check` with TZ=UTC
- [ ] 3.5 Verify the flow against a real client (Gemini Apps Connected apps) and record the outcome in this change
