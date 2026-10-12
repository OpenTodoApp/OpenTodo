# Tasks

## 1. Server

- [x] 1.1 `config.ParseTrustedProxies` returns `TrustedProxies` (prefixes, keyword, applied, invalid, hint) and never fails; commas and whitespace separate entries; keyword case-insensitive; near-miss hint at edit distance ≤ 2 (design D1, D2); verify `go test ./internal/config -run TestTrustedProxiesLenient`
- [x] 1.2 `config.Load` records a `config.Warning` instead of failing; `Config.LogWarnings` writes one `slog.Error` line; `main` calls it after creating the logger (design D4); verify the log assertions in `TestTrustedProxiesLenient`
- [x] 1.3 Client address unchanged for valid values, never widened by invalid ones, all-invalid equals unset (design D3); verify `go test ./internal/httpapi -run 'TestClientAddressBehindTrustedProxies|TestInvalidTrustedProxyEntriesNeverWidenTrust'`
- [x] 1.4 `GET /api/v1/me` carries `config_warnings` for the owner's session only; health check stays 200 (design D5, D6); verify `go test ./internal/httpapi -run 'TestConfigWarningsOwnerOnly|TestHealthyWithConfigWarnings'`

## 2. Web

- [x] 2.1 `ConfigWarning` type and `api.me()` field; `ConfigWarningsNotice` at the top of the Settings overview and of Administration (design D5); verify `npm test` (`src/app/configWarnings.test.tsx`) and `npm run build` in `web/`
- [x] 2.2 Screenshot of the owner notice with `OPENTODO_TRUSTED_PROXIES=cloudflar`; layout check on port 18083 (Chromium); verify the screenshot shows the variable, the ignored value and the fix

## 3. Docs

- [x] 3.1 `docs/self-hosting/docker.md` "Behind a reverse proxy" and `docs/self-hosting/coolify.md` troubleshooting: typo behaviour, where the warning shows; `make docs` twice with no diff and `make docs-check`
- [x] 3.2 CHANGELOG `## [Unreleased]` → Changed; verify `make check`
