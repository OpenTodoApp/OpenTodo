## 1. Build

- [x] 1.1 `resolveComment`: `guest_name` and `page_id` from a device only on create, for a page of the comment's task that the writer published; on a stored comment only a repeat
- [x] 1.2 The attachment rule uses the existing `storedField`
- [x] 1.3 Tests: `TestGuestReplyMarksComeOnlyFromThePagesPublisher`; `authored_rules.golden` updated (12 rows)

## 2. Checks

- [x] 2.1 `go test ./internal/sync ./internal/codesize ./internal/writepaths`, the task page and comment tests of `internal/httpapi`, `make openspec-validate`, `make repo-check`
