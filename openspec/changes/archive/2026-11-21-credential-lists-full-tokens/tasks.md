# Tasks

## 1. Server

- [x] 1.1 `GET /api/v1/tokens` and `GET /api/v1/me/oauth-grants` use `signedIn.FullTokens()`. Verify: `go test ./internal/httpapi -run TestCredentialListsNeedAFullToken`.
- [x] 1.2 The v1 surface records both policies, and `docs/stability.md` allows the exception. Verify: `go test ./internal/httpapi -run TestV1SurfaceIsAdditive`.

## 2. Release

- [x] 2.1 `docs/api.md`, the OpenAPI description and a Security changelog fragment. Verify: `make docs-check`, `make repo-check`.
