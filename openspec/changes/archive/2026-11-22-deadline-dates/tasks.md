## 1. Deadlines as dates

- [x] 1.1 `user_prefs.deadline_dates` in `internal/sync/ops.go` (`UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`); `web/src/lib/deadlineDates.ts`; `TaskRow` shows the date in the countdown's place and tone. Verify: `npx vitest run src/app/deadlineDates.test.tsx src/app/taskRow.test.tsx` in `web/`
- [x] 1.2 The switch in Settings › Appearance and its settings search entry; the strings in every locale. Verify: `make i18n-check`
- [x] 1.3 `docs/deadlines-and-start-dates.md`; `changelog.d/Added/deadline-dates.md`. Verify: `make docs` and `make docs-check`
