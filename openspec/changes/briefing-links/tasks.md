## 1. Data

- [x] 1.1 `user_prefs.briefing` (D4) in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, `USER_PREFS_DEFAULTS` and `internal/sync/testdata/schema_fixture.json`, with `briefingHidden`/`setBriefingShown` in `userPrefs.ts`; verify `go test ./internal/sync/...` and `lib/userPrefs.test.ts`
- [x] 1.2 Late facts carry `ids` (D1) in `lib/briefing.ts` and `briefing.fixtures.json`; verify `lib/briefing.test.ts`

## 2. Links and the menu

- [x] 2.1 `app/briefingLinks.ts` (D2): reveal tasks in Today, open Upcoming at a day, request the notifications; the bell and the shell answer the request; verify `app/briefingLinks.test.tsx`
- [x] 2.2 `app/Briefing.tsx` (D3): named tasks, late counts, full days and replies as quiet buttons with accessible names; verify `app/Briefing.test.tsx`
- [x] 2.3 Today's and Upcoming's menu item Hide briefing / Show briefing and the hidden head (D4); the Daily check unchanged; verify `app/briefingLinks.test.tsx`
- [x] 2.4 Health word tooltip and tap below 36 rem, detail read at every width (D5); verify `app/projectsTable.test.tsx`

## 3. Copy, docs and checks

- [x] 3.1 The new messages in every catalog; verify `make i18n-check`
- [x] 3.2 Stories: the briefing with links, the narrow health cell; verify `make ui-check` in CI
- [x] 3.3 Docs `docs/briefing.md` and `docs/all-projects.md`, CHANGELOG under Unreleased; verify `make docs-check`
- [ ] 3.4 Run `npm test` and `npm run build` in web/, `go test ./internal/sync/...`, `make check`; baselines from CI's UI baselines workflow; CI green
