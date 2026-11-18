# Tasks

## 1. Description

- [x] 1.1 `internal/httpapi/openapi_record_test.go`: record the core routes on a test server with a frozen clock, ids and random values replaced by stable placeholders. Verify: `UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription` twice gives the same file.
- [x] 1.2 `internal/httpapi/openapi_examples_test.go`: put the recorded examples, or the schema's, on every body, the error envelopes on the shared error responses, and the ratchet `openAPIExamplelessMax` in `lintOpenAPI`. Verify: `go test ./internal/httpapi -run 'OpenAPI|Surface'`.
- [x] 1.3 `docs/api.md` says the description has examples. Verify: `make docs-check`.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Added/openapi-examples.md`. Verify: `make repo-check`.
