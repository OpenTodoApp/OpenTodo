## 1. Configuration

- [x] 1.1 `OPENTODO_CORS_ORIGINS` parsed into `Config.CORSOrigins` with `ParseOrigin`; invalid entries, demo and host mode stop startup; verify `go test ./internal/config -run 'CORS|ConfigurationReference'`

## 2. Server

- [x] 2.1 `cors` middleware before the demo and host guards: preflight 204 for listed origins, `Access-Control-Allow-Origin` for bearer requests only, never `Access-Control-Allow-Credentials`, `Vary: Origin`, sign-in flows excluded; verify `go test ./internal/httpapi -run CORS`
- [x] 2.2 Cookie requests from a listed origin get no CORS headers and their writes stay 403 `bad_origin`; verify `go test ./internal/httpapi -run 'TestCORSCookieRequestsStaySameOrigin|TestCrossSiteCookieWritesAreRejected'`
- [x] 2.3 Off by default and the route policies unchanged; verify `go test ./internal/httpapi/...`

## 3. Docs and checks

- [x] 3.1 `docs/api.md` (Calling the API from another site), `docs/self-hosting/configuration.md`, `SECURITY.md`, `docs/security/threat-model.md`, `changelog.d/Added/cors-for-tokens.md`; verify `make docs-check` and `make repo-check`
- [x] 3.2 `make openspec-validate`; `go vet ./...`; `go test ./...`
