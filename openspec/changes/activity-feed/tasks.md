# Tasks

Prerequisites: `project-sharing`, `comments-and-activity` and `realtime-sync-channel` are archived (the last only for group 4).

## 1. Seen state (server and schema)

- [ ] 1.1 Add entity `project_prefs` with `feed_seen_at` to the op schema, always resolved to the author's personal scope; update `docs/sync.md`; verify `TestProjectPrefsAreAlwaysPersonalScope` via `go test ./...`
- [ ] 1.2 `GET /api/v1/activity` aggregating the caller's shared scopes with cursor pagination and project/actor/kind filters, 400 on an unknown cursor; verify `TestFeedRouteAuthFiltersAndIsolation` via `go test ./...`
- [ ] 1.3 Document the route and entity in `docs/api.md`; verify examples match handler payloads and `make check` passes

## 2. Client data layer

- [ ] 2.1 `project_prefs` types and defaults, local `prefs` table, `markSeen(projectId, time)` that never moves backwards and debounces per open; verify `prefs.test.ts` cases "never decreases", "syncs via outbox" via `npm test`
- [ ] 2.2 Unread computation over the local activity table excluding own events, per project and total, exposed as live queries; verify `feed.test.ts` cases "counts others only", "capped at retention bound", "initial seen time on first sync" via `npm test`
- [ ] 2.3 Feed query across shared projects grouped by day with local filters and server pagination without duplicates; verify `feed.test.ts` cases "day grouping", "filters do not affect unread", "older page dedupes" via `npm test`

## 3. Client UI

- [ ] 3.1 Feed view with day groups, project badges, filters, `j`/`k`/Enter navigation, `g f` shortcut listed in `?`, mark seen on open; verify browser flow: offline feed lists local events and opening it zeroes the counts; `npm run build` succeeds
- [ ] 3.2 Sidebar unread counts per shared project and feed total, project activity view marks seen; verify browser flow: second account's change raises the count after sync and it clears when the project activity opens

## 4. Live refresh

- [ ] 4.1 Subscribe the feed and counts to sync completion so a server wake-up refreshes them; verify browser flow with the realtime channel: Bob's completion appears at the top of Alice's open feed within a few seconds; with the channel blocked, it appears on the next periodic sync with no error shown

## 5. Integration and docs

- [ ] 5.1 Two-account end-to-end run: shared changes → unread counts → feed open marks seen → second device inherits seen state → filters → older history; verify the run finishes with no console errors and `make check` passes
- [ ] 5.2 Update `README.md`, `CHANGELOG.md` Unreleased; verify `openspec validate --all --strict` passes
