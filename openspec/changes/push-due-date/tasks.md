## 1. The words

- [x] 1.1 `notificationDue(due, at)` in `lib/dates.ts` and `reminderBody` in `lib/reminderBody.ts` (a habit's tiny version first); the shells' text as of the firing day, the hidden tab's as of now (vitest `src/lib/dates.test.ts`, `src/lib/shellPublish.test.ts`)
- [x] 1.2 The service worker's due text follows the same rule, with "Today" and "Tomorrow" pinned to the catalog and a zoned due read in the device's zone; no "Due" prefix; the payload's due when the task is not on the device (vitest `src/lib/pushWorker.test.ts`)

## 2. Payload

- [x] 2.1 `Payload.due` with content opted in, never for an encrypted account (`go test ./internal/push`)

## 3. Shells

- [x] 3.1 `ShellReminder.due` with the title; bridge fixtures regenerated (vitest `src/lib/shellBridge.fixture.test.ts`, `src/lib/shellPublish.test.ts`)
- [ ] 3.2 Android shows it as the body, and a push takes it from the schedule (`make android`: `ReminderScheduleTest`, `BridgeFixtureTest`)
- [ ] 3.3 iOS shows it as the body (`ShellDataTests` reads the bridge fixtures)

## 4. Check

- [x] 4.1 `npm test` and `npm run build` in web/, `go test ./internal/push`, `make i18n-check`, `make openspec-validate`, `make docs-check`
