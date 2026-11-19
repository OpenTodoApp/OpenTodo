# Tasks

## 1. Server

- [x] 1.1 A creation answered 409 by a WebDAV calendar takes the existing event over. Verify: `go test ./internal/calsync/...` (`TestExistingEventIsAdoptedWhenCreationAnswers409`, with the test server's `ConflictOnExisting`; `TestExistingEventIsAdoptedAndServerWithoutETags` unchanged).

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/calsync-existing-event-conflict.md`. Verify: `make openspec-validate`, `make docs`, `make repo-check`.
