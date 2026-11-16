## 1. Generator

- [x] 1.1 `TestOpenAPIDescription` in `internal/httpapi`: build the document from the route table, `staticRoutes`, `errorStatuses` and the collection expansion (D1); `UPDATE_OPENAPI=1` writes `openapi.json.gz` and a readable `docs/openapi.json`. Verify `go test ./internal/httpapi -run TestOpenAPIDescription` passes and fails after adding a route without updating.
- [x] 1.2 The type table (D2) with named component schemas for the op kinds and entities, and the count of untyped fields. Verify the document validates as OpenAPI 3.1 with a validator run in the test (a small JSON Schema check of the 3.1 meta-schema, no new module dependency), and a test asserts `POST /api/v1/tasks` and `POST /api/v1/sync` have their fields.
- [x] 1.3 Security and errors (D3). Verify a test asserts a session-only route, a `.fullTokens()` route, a public route and one deprecated route are described as D3 says.
- [x] 1.4 Summaries and links from `docs/api.md` (D5). Verify a test asserts every operation's `externalDocs` points at an existing heading.

## 2. Serving and publishing

- [x] 2.1 `GET /api/v1/openapi.json`, policy `public(...)`, ETag, cache, gzip (D4); the server version in `info.version`. Verify the httpapi test for 200 without auth, 304 on a matching ETag, 405 on POST, and the same answer on a demo server; `go test ./...`.
- [x] 2.2 Release asset and site bundle `api/openapi.json`. Verify `node --test scripts/site-bundle.test.mjs` and the release workflow's dry run list the file.

## 3. Docs

- [x] 3.1 `docs/api.md`: a section on the description, its URL and what it covers; `docs/stability.md` notes the description follows the v1 surface. Verify `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/openapi-description.md`. Verify `make repo-check`.

## 4. Checks

- [x] 4.1 `make check`. Verify it passes.
