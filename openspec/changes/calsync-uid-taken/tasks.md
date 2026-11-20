# Tasks

## 1. Server

- [x] 1.1 `internal/calsync/calsynctest`: `KeepDeletedUIDs` keeps a deleted event's UID taken and answers 409 to a creation with a taken UID, like Google's Bin. Verify: `TestUIDInTheBinGetsANewEvent` fails with `http_409` before 1.2.
- [x] 1.2 `internal/calsync/transport.go`: a creation answered 409 is written again with UID `<task-id>-<8 hex>` at `<that UID>.ics`; replace keeps the UID its address names (D1). Verify: `go test ./internal/calsync` passes, with `TestUIDInTheBinGetsANewEvent` (a completed and reopened task, an event deleted in the calendar and the task dated again, a later rename, a move in the calendar).

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/calsync-uid-taken.md`. Verify: `make repo-check`.
- [ ] 2.2 With a real Google connection: complete a synced task, reopen it, Sync now: no `http_409`, the event is back.
