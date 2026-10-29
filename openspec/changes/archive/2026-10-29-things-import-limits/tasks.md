## 1. Importer

- [x] 1.1 `checkSchema`: refuse virtual tables and hidden or generated columns in the tables read (`TestThingsRefusesSchemaThatComputes`, `go test ./internal/importer`)
- [x] 1.2 `SQLITE_LIMIT_LENGTH` of 1 MiB on one pinned connection (`TestThingsRefusesOversizedValue`)
- [x] 1.3 The Things fixtures still import (`go test ./internal/importer`)

## 2. Docs

- [x] 2.1 `docs/import.md` Things database
- [x] 2.2 CHANGELOG Unreleased, Security
