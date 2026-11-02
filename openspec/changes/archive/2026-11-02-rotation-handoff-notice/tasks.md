# Tasks

## 1. Server

- [x] 1.1 `emitAssignments` takes the turn rule from its caller: batches keep "completed in this batch", departures mark every hand-off as a turn
- [x] 1.2 Emit after the commit of a member removal, a workspace group change and an account deletion

## 2. Tests and docs

- [x] 2.1 `internal/sync` test: Bob removed on his turn, Carol gets a turn event; a plain unassignment notifies nobody; the author is not notified
- [x] 2.2 Docs: the shared projects guide mentions the hand-off notification; CHANGELOG entry
