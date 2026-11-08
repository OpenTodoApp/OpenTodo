## 1. Web push

- [x] 1.1 `push-sw.js`: Done first, then Snooze 10 min and Dismiss, cut to `Notification.maxActions`; Done posts `reminders:done` to one window or opens `/?reminder=<id>&action=done`; verified by `src/lib/pushWorker.test.ts` "Done on a reminder notification"
- [x] 1.2 `ReminderToasts.tsx` applies `reminders:done` with `applyReminderAction`; a repeating task advances from both paths (message and address); verified by `pushWorker.test.ts` "a repeating task advances"
- [x] 1.3 An encrypted account: the occurrence record leaves as ciphertext and the series advances; verified by `src/lib/e2ee.test.ts` "Done on a reminder notification"
- [x] 1.4 The message `Done|task` in every catalog and the worker's table; verified by `pushWorker.test.ts` (texts pinned to the catalogs) and `make i18n-check`

## 2. Android

- [x] 2.1 `ReminderSchedule.REMINDER_ACTIONS` (done, snooze, dismiss) and `LOCATION_ACTIONS`, used by `Notifier`; the shared fixture `actions.json` lists the same order; verified by `ReminderScheduleTest` and `BridgeFixtureTest` (`make android`) and `src/lib/shellBridge.fixture.test.ts`

## 3. Checks and docs

- [x] 3.1 `docs/reminders.md`, `docs/push-notifications.md`, `docs/android-app.md`; `changelog.d/Added/reminder-done-action.md`; `make docs-check`, `make repo-check`, `make openspec-validate`
- [x] 3.2 `npx vitest run` for the touched areas, `npm run build`, `make bundle-budget`
