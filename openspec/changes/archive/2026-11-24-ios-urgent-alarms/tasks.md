# Tasks

Web tasks run `npm test` and `npm run build` in `web/`. Server tasks run `go test ./...`. iOS tasks run `make ios` (Xcode 16.4 in CI, AlarmKit compiled out) and `make ios-archive` (the newest Xcode, AlarmKit compiled in) through the CI `ios` job.

## 1. Data

- [x] 1.1 `reminder.urgent` (kBool, default `false`) in `internal/sync/ops.go` `Schema`, generated schema refreshed with `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. Verified by `go test ./internal/sync` (a non-boolean `urgent` is refused).
- [x] 1.2 `urgent?: boolean` on `Reminder` in `web/src/lib/types.ts` and `setReminderUrgent(id, urgent)` in `web/src/lib/reminders.ts`, one mutation that leaves the firing and delivery state alone. Verified by `reminders.test.ts`.

## 2. Web app

- [x] 2.1 `RemindersField`: a checkable **Urgent** item in a time reminder's menu and the `alarm-clock` icon on an urgent chip; none on location reminders. Verified by `remindersField.test.tsx`.
- [x] 2.2 `shellReminders` adds `urgent: true` to an urgent entry only; `ShellReminder` gains `urgent?`. Verified by `shellPublish.test.ts`.
- [x] 2.3 Shared bridge fixture `reminders-urgent.json` produced by the web code. Verified by `shellBridge.fixture.test.ts`.
- [x] 2.4 Translations of "Urgent" in every shipped catalog. Verified by `make i18n-check`.

## 3. iOS

- [x] 3.1 `Reminders.Handed.urgent`, parsed from the hand-over; `Alarms.candidates` (alarm or notification), `Alarms.route` (the permission rule), `Alarms.alarmID` and `Alarms.changes` as pure functions. Verified by `ReminderTests` and `AlarmTests` in `make ios`, reading `reminders-urgent.json`.
- [x] 3.2 `AlarmKitScheduler` in `Reminders.swift`: AlarmKit behind `#if canImport(AlarmKit)` and `@available(iOS 26.0, *)`: authorization, list, cancel, schedule with the title, Stop and Snooze 10 min; `SnoozeReminderIntent` opening `/?reminder=<id>&action=snooze`. `Reminders.apply` arms alarms after the notification permission and cancels them when it is refused, `Reminders.clear` cancels every alarm. Verified by `make ios` on Xcode 16.4 and `make ios-archive` on Xcode 26 in the CI `ios` job.
- [x] 3.3 `NSAlarmKitUsageDescription` in `project.yml` and the Info.plist, translated in `InfoPlist.xcstrings`. Verified by `make i18n-check` and the CI `ios` job.
- [x] 3.4 `scripts/release/ios-testflight.sh archive` refuses a binary that links AlarmKit strongly. Verified by the CI `ios` job's archive step.
- [ ] 3.5 Device run on an iPhone with iOS 26: the permission prompt with the first urgent reminder, an alarm with the phone locked, Snooze 10 min, Stop, clearing Urgent, sign-out; and an iPhone on iOS 18 getting a notification. Recorded in the `mobile/README.md` table. Left open: it needs an iPhone on iOS 26 (AlarmKit asks for its permission and rings only on a device); the steps are in the pull request for the owner.

## 4. Docs

- [x] 4.1 `docs/reminders.md` and `docs/ios-app.md` describe urgent reminders; `mobile/README.md` lists `Alarms` and the bridge field. Verified by `make docs` and `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Added/ios-urgent-alarms.md`. Verified by `make repo-check`.
- [x] 4.3 `make check` passes.
