## 1. Server

- [x] 1.1 `internal/mcpoauth/platforms.go`: the platform table (Google, ChatGPT, Claude) with sources, `PlatformByID`, `PlatformOf`, `ValidCustomRedirect`; `Client.AllowsRedirect` matches prefixes only for platform prefixes; `Client.RotatesRefresh` exempts only platforms that keep their refresh token; verify `go test ./internal/mcpoauth` (`TestPlatformRedirects`, `TestLookAlikeRedirectsAreRefused`, `TestValidCustomRedirect`, `TestAllowsRedirect`)
- [x] 1.2 `POST /oauth/register` accepts one platform's addresses and stores its set; `POST /api/v1/settings/mcp/clients` takes `platform` or validated `redirect_uris`; `GET` lists `platforms`; verify `go test ./internal/httpapi -run MCPOAuth` (`TestMCPOAuthDynamicRegistrationPlatforms`, `TestMCPOAuthPlatformClients`, `TestMCPOAuthCustomRedirect`, `TestClientRotatesRefresh`)

## 2. Settings screen

- [x] 2.1 `OAuthClients.tsx`: App choice (Gemini, ChatGPT, Claude, Other app) and a Redirect address field for Other app; rows name the app or the custom host; `api.ts` and `assistants.ts`; six catalogues; verify `npm test` (`OAuthClients.interaction.test.tsx`, `assistantsSettings.test.tsx`), `npm run build`, `make i18n-check`, `make ui-lint`

## 3. Docs and checks

- [x] 3.1 `docs/mcp-oauth.md` ("Connecting ChatGPT", "Connecting Claude (claude.ai)"), `docs/api.md`, `docs/mcp.md`, `docs/security/threat-model.md`, `docs/architecture.md`; changelog fragment `changelog.d/Fixed/mcp-oauth-connector-redirects.md`; verify `make docs-check` and `make repo-check`
- [x] 3.2 `go test ./...`, `make openspec-validate`, `make check`
