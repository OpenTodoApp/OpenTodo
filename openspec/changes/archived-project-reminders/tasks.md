# Tasks

- [x] 1.1 The server's scheduler skips reminders on tasks below an archived project without recording anything, and delivers them once after unarchiving; the notification channels' hook sees only eligible reminders. Verify: `go test ./internal/push` (`TestSchedulerSkipsArchivedProjects`, `TestProjectQuietVectors`).
- [x] 1.2 The in-app watcher and the reminders handed to a native shell skip the same tasks, through `inQuietProject`, and the shell's schedule follows project changes. Verify: `npm test` in web/ (`reminderWatcher.test.ts`, `shellPublish.test.ts`).
- [x] 1.3 One vectors file for the rule, listed in `docs/contracts.md`; the reminders guide names archived projects. Verify: `make repo-check`, `make docs-check`.
