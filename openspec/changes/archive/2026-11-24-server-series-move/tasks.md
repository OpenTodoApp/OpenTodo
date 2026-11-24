## 1. Refuse the date on the server

- [x] 1.1 `ExceptionOn` in `internal/sync/occurrences.go`, the port of `exceptionOn`; `exception_on` cases in `web/src/lib/series.fixture.json`. Verify: `go test ./internal/sync -run TestSeriesSharedFixture` and `npx vitest run src/lib/series.fixture.test.ts` in web/.
- [x] 1.2 `ApplyStrict` refuses a batch that moves an existing series onto a taken date (`series_move_check.go`, `ReasonSeriesDateTaken`); `Apply` does not. Verify: `go test ./internal/sync -run 'SeriesMove|SyncApplyNever'` (done, skipped, moved; a free date; an undo that trashes the record; the sync path; an earlier piece's record).
- [x] 1.3 REST answers `409 series_date_taken` with the reason; MCP answers the tool error with the date and state; `/api/v1/agent` maps it to 409. Verify: `go test ./internal/httpapi -run SeriesMoveOntoRecord`.
- [x] 1.4 The web message for the code in every catalogue; `docs/recurrence.md`, `docs/api.md`, `docs/mcp.md`, `docs/openapi.json`; changelog fragment. Verify: `make i18n-check`, `go test ./internal/httpapi -run 'TestErrorCodesFixture|TestOpenAPIDescription|TestV1SurfaceIsAdditive'`, `make docs-check`.

## 2. Check

- [x] 2.1 `go test ./...`, `npm test` in web/ and `openspec validate --all --strict` pass.
