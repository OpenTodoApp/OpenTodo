# Bridge fixtures: one shared contract between the web app and the Android shell

## Why

The web app hands the Android shell JSON strings through the bridge (`scheduleReminders`, `publishWidget`, the sign-out reset) and the shell opens the app at addresses the web app reads (`?reminder=&action=`, `?task=`, `?add=`). The Kotlin unit tests build their own JSON and the web tests check their own objects, so a renamed field or a changed address passes both suites and breaks reminders or widgets on phones.

## What Changes

- `web/src/lib/shellBridge.fixture.test.ts` builds the bridge payloads with the web app's own builders (`shellReminders`, `shellWidget`, `forgetShellData`) from fixed rows, with what the shell must read from each, and writes them to `mobile/android/app/src/test/resources/bridge/*.json`; it fails when the files are out of date (`UPDATE_BRIDGE_FIXTURES=1` rewrites them). It also checks that every address in `actions.json` is read back by `shellUrlAction`.
- `BridgeFixtureTest.kt` parses the same files with `ReminderSchedule.parse` and `WidgetModel.parse` and builds the addresses with `ReminderSchedule`; the quick-add address becomes the constant `ReminderSchedule.QUICK_ADD_PATH`.

## Out of scope

- Biometric and external-link calls (strings without a structure).
- An iOS or desktop shell.

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, G6); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `native-shells`: the bridge payloads and addresses are pinned by fixtures both sides test.

## Impact

`web/src/lib/shellBridge.fixture.test.ts`, `mobile/android/app/src/test/resources/bridge/`, `mobile/android/app/src/test/java/app/opentodo/BridgeFixtureTest.kt`, `ReminderSchedule.kt` and `Widgets.kt` (one constant). A web change to a payload changes files under `mobile/`, so the Android job runs. No change to the app's behaviour.
