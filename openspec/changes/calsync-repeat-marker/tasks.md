## 1. Marker

- [ ] 1.1 `internal/calfeed`: `WriteEvent` and the Outlook subject title a repeating task's event `🔁 <title>` (not for an encrypted account or title); table tests. Verify: `go test ./internal/calfeed`.
- [ ] 1.2 `internal/calsync/mapping.go`: `Snapshot.Repeats`, the marker removed in `EventSnapshot` and `EventOps` only when the stored snapshot repeats; tests for every scenario of "Repeating tasks marked in the calendar", including the one-time rewrite after upgrade and a one-off title starting with 🔁. Verify: `go test ./internal/calsync`.

## 2. Docs and checks

- [ ] 2.1 One line in `docs/calendar-sync.md`, `changelog.d/Added/calsync-repeat-marker.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `go test ./...`.
