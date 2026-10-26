## 1. Web

- [x] 1.1 `web/src/lib/shellBridge.fixture.test.ts` writes and checks `mobile/android/app/src/test/resources/bridge/*.json` from `shellReminders`, `shellWidget` and `forgetShellData`, and reads every address back with `shellUrlAction`; `npx vitest run src/lib/shellBridge.fixture.test.ts` passes

## 2. Android

- [x] 2.1 `BridgeFixtureTest.kt` parses the fixtures with `ReminderSchedule` and `WidgetModel` and builds the addresses; `ReminderSchedule.QUICK_ADD_PATH` used by `Widgets.kt`; runs in `make android` (CI Android job)
