## 1. Server

- [x] 1.1 `cookieWriteAllowed` in `requireAuth`: Fetch Metadata, then a JSON content type, for cookie writes without `Origin`; verify `go test ./internal/httpapi -run TestCrossSiteCookieWritesAreRejected`
- [x] 1.2 The route matrix refuses a form post without either header on every write route; verify `go test ./internal/httpapi -run TestRouteMatrix`
- [x] 1.3 Test clients send `Sec-Fetch-Site: same-origin` like a browser (`browser_transport_test.go`); verify `go test ./...`

## 2. Docs and checks

- [x] 2.1 `docs/api.md`, `docs/security/threat-model.md`, CHANGELOG `### Security`; verify `make docs-check`
- [x] 2.2 `make openspec-validate`
