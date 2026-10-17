# Tasks

## 1. Dependencies (CORE-3)

- [x] 1.1 Read a scope's dependency graph once per batch and update it in memory on stored blocked_by ops under last-writer-wins. Verify: `go test ./internal/sync -run 'TestBlockedByGraphReadOncePerBatch|TestBlockedByBatchGraphFollowsLastWriterWins|TestBlockedBy'`; `go test ./internal/sync -run '^$' -bench BlockedByBatch -benchtime=1x`.
- [x] 1.2 Partial index on blocked_by rows (migration 0038). Verify: `go test ./internal/store`; `go test ./internal/sync -run '^$' -bench ScopeBlockedGraph`.

## 2. Activity feed (CORE-8)

- [x] 2.1 `sync.FeedReader` lists entities newest first and reads their histories without opaque fields; the feed route stops once the page is certain. Verify: `go test ./internal/httpapi -run 'TestFeedPagesMatchWholeHistory|TestFeedFirstPageCostDoesNotGrowWithHistory|TestFeedRoute'`; `go test ./internal/activity`.

## 3. Public view and memberships (CORE-15, CORE-19)

- [x] 3.1 Public project view in one query per kind of child. Verify: `go test ./internal/sync -run TestPublicProjectCostDoesNotGrowWithTasks`; `go test ./internal/httpapi -run Public`.
- [x] 3.2 Memberships in one members query. Verify: `go test ./internal/sync -run 'TestMembershipsCostDoesNotGrowWithProjects|Member|Sharing'`.

## 4. CalDAV (INT-9)

- [x] 4.1 Index the view once per request; multiget and resource lookups by map. Verify: `go test ./internal/httpapi -run 'TestCalDAVMultigetCostPerHrefDoesNotGrowWithTasks|Dav|Caldav|Calendar|Put|Sync'`.
- [x] 4.2 calendar-query encodes once and skips parsing for the plain filter. Verify: `go test ./internal/caldav -run TestMatchesAnyTodoAgreesWithMatches`; `go test ./internal/httpapi -run TestCalendarQueryTimeRange`.
- [x] 4.3 Confirm app password last-use writes are throttled (bound-server-resources). Verify: `go test ./internal/auth -run LastUse`.

## 5. Checks

- [x] 5.1 `go vet ./...`, `gofmt -l`, `go test ./...`, `npx --yes @fission-ai/openspec validate --all --strict`; CHANGELOG under Unreleased.
