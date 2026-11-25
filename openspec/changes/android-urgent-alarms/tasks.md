# Tasks

Web tasks run `npm test` and `npm run build` in `web/`. Server tasks run `go test ./...`. Android tasks run `make android` (unit tests, lint, the store and translation checks, a debug APK) in the CI `android` job, and the instrumented tests on an emulator.

## 1. Android

- [x] 1.1 `ShellReminder.urgent`, parsed (only a JSON `true`) and stored with the schedule. Verified by `ReminderScheduleTest` and `BridgeFixtureTest` reading `reminders-urgent.json`.
- [x] 1.2 `UrgentAlarms.nextAsk` (exact alarms first, then full-screen, each when missing on that Android version and not asked before) and `UrgentAlarms.armAsAlarmClock`. Verified by `ReminderScheduleTest`.
- [x] 1.3 `Scheduler.arm`: `setAlarmClock` for an urgent reminder when exact alarms are allowed. `Notifier.show`: the `urgent` channel (alarm sound, `USAGE_ALARM`, `FLAG_INSISTENT`, `CATEGORY_ALARM`), the full-screen intent and the three actions; a push of a reminder the schedule holds as urgent rings the same way. Verified by `make android` (compile, lint) and the device checks below.
- [x] 1.4 `AlarmActivity` (over the lock screen, not exported; inert after the first tap, closed when answered elsewhere or when its notification is gone, **Reminder** on a lock screen hiding private content) and `ReminderActions.run`, shared with `NotificationActionReceiver`, answering each firing once (`UrgentAlarms.firstAnswer`). Verified by `ReminderScheduleTest`, `make android` (lint) and the device checks below.
- [x] 1.5 Bridge: capability `urgent-alarms` (visible app, Android 12+), method `allowUrgentAlarms`; `MainActivity` opens the pages and the next one on return. `USE_FULL_SCREEN_INTENT` in the manifest and `store/permissions.txt`; the Play declaration in `store/play-review.md`. Verified by `BridgeFixtureTest` and `checkStoreMetadata` in `make android`.
- [x] 1.6 `channel_urgent` in the app's ten languages. Verified by `checkTranslations` in `make android`.
- [ ] 1.7 Device run on Android 14 or later (Google Play and F-Droid builds) and on Android 12: the pages opened when turning Urgent on, the alarm with the phone locked, Done, Snooze 10 min, Dismiss, swipe, without full-screen permission, without exact alarms, Do Not Disturb (with the channel's override set before the first alarm), reboot and unlock, a double answer on a repeating task, a hand-over while ringing, Change server. Left open: it needs a phone; the steps are in the pull request for the owner.

## 2. Web app

- [x] 2.1 `allowUrgentAlarms()` in `lib/shell.ts` (only with `urgent-alarms`); `RemindersField` calls it when **Urgent** turns on. Verified by `shell.test.ts` and `remindersField.test.tsx`.
- [x] 2.2 `capabilities.json` lists `urgent-alarms` and `allowUrgentAlarms`. Verified by `shellBridge.fixture.test.ts`, `BridgeFixtureTest` and the iOS `ShellDataTests`.

## 3. Docs

- [x] 3.1 `docs/android-app.md`, `docs/reminders.md`, `docs/mcp.md`, the agent tools' and op schema's description of `urgent`, `mobile/README.md`. Verified by `make docs`, `make docs-check` and `go test ./internal/agenttools ./internal/sync`.
- [x] 3.2 Changelog fragment `changelog.d/Added/android-urgent-alarms.md`. Verified by `make repo-check`.
