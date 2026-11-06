## 1. Rotation and reuse detection

- [x] 1.1 Migration `0059_mcp_oauth_refresh_rotation.sql` (`mcp_oauth_refresh_used`); `mcpoauth.RotateRefresh`, `GrantByUsedRefresh`, `Client.RotatesRefresh`; `UpsertGrant` clears used hashes; verify `TestClientRotatesRefresh`
- [x] 1.2 `oauthRefresh` rotates for rotating clients and revokes the grant on reuse with `mcp_oauth.refresh_reused`; verify `go test ./internal/mcpoauth ./internal/httpapi -run MCPOAuth` (`TestMCPOAuthRefreshRotates`, `TestMCPOAuthRefreshReuseRevokesTheGrant`, `TestMCPOAuthRefreshReuseNeedsTheClient`, `TestMCPOAuthConcurrentRotatingRefreshRevokes`, `TestMCPOAuthGoogleClientKeepsItsRefreshToken`)
- [x] 1.3 Audit event in `internal/audit`, the web label and the six catalogues; verify `go test ./internal/audit`, `npm test` and `make i18n-check`

## 2. Docs and checks

- [x] 2.1 `docs/mcp-oauth.md`, `docs/api.md`, `docs/security/threat-model.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 2.2 `go test ./...`, `make openspec-validate`
