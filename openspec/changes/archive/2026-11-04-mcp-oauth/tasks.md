# Tasks

## 1. Server

- [x] 1.1 Migration `0057_mcp_oauth` adding `mcp_oauth_client`, `mcp_oauth_code` and `mcp_oauth_grant`; verify `go test ./internal/store/...`
- [x] 1.2 `internal/mcpoauth`: client creation and lookup (hashed secret, constant-time compare), Google redirect matching, S256 verification, single-use codes with expiry, grants with a stable refresh token; verify `go test ./internal/mcpoauth/`
- [x] 1.3 Routes in `internal/httpapi/mcp_oauth.go`: both well-known documents (plus the `/mcp` protected-resource variant), `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`, all off while MCP is off and demo-denied where credentials are issued; verify `go test ./internal/httpapi/ -run 'MCPOAuth|WellKnown'`
- [x] 1.4 Owner client routes `GET`/`POST`/`DELETE /api/v1/settings/mcp/clients`, secret shown once; verify `go test ./internal/httpapi/ -run MCPOAuth`
- [x] 1.5 `/mcp` 401 challenge names the protected-resource document; verify `go test ./internal/httpapi/ -run MCP`
- [x] 1.6 Audit: `mcp_oauth.client_created`, `.client_deleted`, `.granted`, `.revoked` in the closed catalogue, naming ids only; verify `go test ./internal/audit/...`

- [x] 1.7 Access tokens expire: `api_token_expiry` side table, `auth.CreateTokenExpiring`, `UserByTokenInfo` and the token list leave expired tokens out; verify `go test ./internal/httpapi/ -run TestMCPOAuthAccessTokenExpires`
- [x] 1.8 Refresh, code exchange, revocation and client deletion are atomic (`SwapGrantToken`, transactions); verify `go test -race ./internal/httpapi/ -run TestMCPOAuthConcurrentRefreshLeavesOneToken`
- [x] 1.9 `/oauth/revoke` authenticates the client and revokes only its own tokens; verify `go test ./internal/httpapi/ -run TestMCPOAuthRevokeIsScopedToTheClient`
- [x] 1.10 Registration rate limit, stale dynamic client removal and cap; verify `go test ./internal/httpapi/ -run TestMCPOAuthRegistrationIsBounded`
- [x] 1.11 Consent: `/oauth/authorize` hands the request to `/?oauth_consent=`, `GET`/`POST /api/v1/me/mcp-consent` (session only, demo-denied) issue the code on Allow; verify `go test ./internal/httpapi/ -run TestMCPOAuthAuthorizeNeedsConsent`
- [x] 1.12 The store is built in `services.Build` and follows `WithClock`; client names are cut with `textutil.Truncate`; the unused public-client path is gone

## 2. Client

- [x] 2.1 `web/src/lib/api.ts`: the four owner calls and their types; new error codes in `server-error-codes.json`
- [x] 2.2 AI assistants card: client list, create form (name, read/agent, Google preset), secret shown once with a copy action, delete; the MCP address to paste into the client; verify `assistantMcpOAuth.test.tsx`
- [x] 2.4 Consent dialog (`OAuthConsent.tsx`, loaded lazily by `OAuthConsentHost.tsx` when the app is opened with `?oauth_consent=`); verify `oauthConsent.test.tsx`
- [x] 2.3 Strings in `messages.json` and the five catalogs; verify `make i18n-check`

## 3. Documentation and release

- [x] 3.1 `docs/mcp-oauth.md`: what it is, connecting Gemini step by step, the manual client path, scopes, revocation; link it from `docs/mcp.md` and `docs/assistant-owner-options.md`; verify `make docs-check`
- [x] 3.2 `docs/api.md` lists the discovery, OAuth and client routes with their errors
- [x] 3.3 CHANGELOG entry under Unreleased (Added: OAuth for the MCP endpoint)
- [x] 3.4 `go test ./...`, `cd web && npm test && npm run build`, `make check`: CI green on #876 (the date-dependent `TestThunderbirdCompletesOccurrence` and the flaky `objectivesSwitch.test.tsx` fail on main too)
- [ ] 3.5 Verify the flow against a real client (Gemini Apps Connected apps), consent step included: asked for on #876 after the merge
