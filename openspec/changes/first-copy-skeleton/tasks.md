# Tasks

## 1. Web app

- [x] 1.1 `useFirstCopyPending` in `web/src/lib/firstCopy.ts`; `useLiveTasks` and `useTasksOfEveryWorkspace` read as not loaded while it is true; `onSyncStatus` and `syncStarted` exported from `web/src/lib/sync.ts`. Verify: `npx vitest run src/lib/firstCopy.test.tsx`, the whole web suite, `npx tsc -b --noEmit`.
- [x] 1.2 Built app, a new browser profile at 360 px: the Plan shows its skeleton, then the days with their tasks; layout shift at most 0.1 (the audit's M12).
- [ ] 1.3 On a phone (the installed web app or the Android app), sign in on a device that held nothing to an account with many tasks: Today and the Plan show their loading rows, then the tasks, with no empty state first.

## 2. Release

- [x] 2.1 Changelog fragment `changelog.d/Fixed/first-copy-skeleton.md`.
