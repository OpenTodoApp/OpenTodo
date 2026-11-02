# Tasks

## 1. Data

- [x] 1.1 Add `upcoming_today` (string, default `""`) to `user_prefs` in `internal/sync/ops.go` `Schema`; regenerate with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`; verify `go test ./internal/sync/...`
- [x] 1.2 `upcomingStartsWithToday` and `setUpcomingStartsWithToday` in `web/src/lib/userPrefs.ts`; verify `upcomingStartWithToday.test.ts` (only `"on"` reads as on)

## 2. Lists

- [x] 2.1 `dayLists.upcomingWithToday` and `tasksForView(..., upcomingToday)`: Today's list, then Upcoming's tasks Today does not hold; verify `upcomingStartWithToday.test.ts` "holds Today's tasks first, each task once"
- [x] 2.2 One `todayGroups` in `listGroups.ts` used by Today and by Upcoming with the option; named Today group, left out when empty; no part drops in Upcoming; verify `upcomingStartWithToday.test.ts` and the unchanged `listGroups.test.ts`
- [x] 2.3 Today limit: slots from Today's tasks only, Waiting for a slot in Upcoming, no Done today; verify the "Today limit" case of `upcomingStartWithToday.test.ts`
- [x] 2.4 Projected days keep Today's groups first (`withProjectedDays`); verify the projections case of `upcomingStartWithToday.test.ts` and `upcomingProjections.test.tsx`
- [x] 2.5 Earlier's fold choice and its header actions in Upcoming (`ListGroups.tsx`, `TaskListView.tsx`); verify `npm test`

## 3. Interface

- [x] 3.1 **Start with Today** in Upcoming's page menu; verify `app/upcomingStartWithToday.test.tsx` (off by default, one synced op, Today unchanged)
- [x] 3.2 Translations in the five catalogs; verify `make i18n-check`
- [x] 3.3 Stories and baselines audited: Upcoming's stories render the default (off), so no baseline changes; verify `make ui-lint`

## 4. Documentation and release

- [x] 4.1 `docs/today-and-upcoming.md` "Start Upcoming with Today"; verify `make docs-check`
- [x] 4.2 CHANGELOG entry under Unreleased (Added)
- [x] 4.3 `go test ./...`, `cd web && npm test && npm run build`, `make openspec-validate`
