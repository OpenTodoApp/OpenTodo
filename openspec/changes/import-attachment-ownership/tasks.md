## 1. File store and importer

- [x] 1.1 `blobs.Store.Matches` (`TestMatches`, `go test ./internal/blobs`)
- [x] 1.2 `storeFiles` refuses an existing file unless `ownStoredFile` (`TestOwnZipExportCannotAdoptAnotherAccountsFile`, `TestOwnStoredFile`, `go test ./internal/importer`)
- [x] 1.3 Own ZIP exports still restore their files (`TestOwnZipExportRestoresFiles`)

## 2. Docs

- [x] 2.1 `docs/import.md` attachments
- [x] 2.2 CHANGELOG Unreleased, Security
