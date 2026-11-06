# Tasks

## 1. Limits

- [x] 1.1 `csvReader` with the field, record and field-count limits; every CSV profile reads through it; verify `go test ./internal/importer -run 'TestCSV|TestEveryCSVProfileChecksFields'`
- [x] 1.2 JSON depth scan in `Parse` and `parseOne`; verify `go test ./internal/importer -run 'TestJSONNesting'`
- [x] 1.3 `LimitError` answers `413 too_large`; verify `go test ./internal/httpapi -run TestImportShapeLimits413`
- [x] 1.4 Existing fixtures and released exports still import, and `FuzzParse` holds; verify `go test ./internal/importer` and `go test ./internal/importer -run '^$' -fuzz '^FuzzParse$' -fuzztime 20s`

## 2. Docs and checks

- [x] 2.1 `docs/import.md`, `docs/import-steps.md`, `docs/api.md`, the threat model and how-we-verify; CHANGELOG `### Security`; tick 6.9 in `external-security-review`; verify `make docs-check`
- [x] 2.2 `go test ./...`, `make openspec-validate`
