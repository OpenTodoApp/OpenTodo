# Proposal

> **Paused (2026-11-13).** The owner decided to stay with the web-view shells and make them feel native instead; the audit and plan are in [`mobile/AUDIT.md`](../../../mobile/AUDIT.md). The code in `mobile/app/` and the app sign-in on the server stay as they are. Nothing here is scheduled; open tasks stay open until the work resumes or the change is withdrawn.

## Why

After `native-app-foundation` and `native-app-everyday`, the native app (on TestFlight as 2.0.0 under the existing record) has the screens people use, but not what the current shells do outside the app:

- the widget;
- the share sheet;
- reminders that fire with the app closed;
- biometric unlock;
- the iPad layout the current iPhone app already supports.

Until it has them, replacing the shells would take features away. This change brings them over, applies a clear go/no-go gate on the TestFlight build, and then ships the native app to the App Store and Google Play under the records it already uses, retiring the web-view shells.

## What Changes

- **Widget.**
  - The existing Swift widget (`mobile/ios/OpenTodoWidget`) joins the app through a config plugin.
  - The app publishes Today's snapshot to the shared App Group after each change and each sync, in the same JSON the widget reads today. An Expo module writes it and reloads the widget's timelines.
  - The Android widget follows with the same data.
  - The fixes testers asked for come with it: the widget refreshes after a background sync and shows its last-updated time.
- **Share extension.**
  - The existing Swift share extension writes shared text, links and images to the App Group inbox, as it does now.
  - The app drains that inbox into tasks at launch and on foreground, through the shared `shareInbox` rules.
  - Android receives the share intent.
- **Reminders on the device.**
  - The app schedules local notifications for upcoming reminders with the shared reminder rules, within the platforms' limit of 64 pending notifications on iOS.
  - Background refresh tops them up.
  - Notification actions: Complete and Snooze, each writing an op.
- **Background refresh** (`BGAppRefreshTask` on iOS, WorkManager on Android) pulls, refreshes the widget and reschedules reminders.
- **Biometric unlock** of an encrypted account: a wrapped key in the Keychain or Keystore, released by Face ID, Touch ID or the fingerprint sensor.
- **iPad.** A split view with the Browse list as the sidebar, the list and the task detail side by side, keyboard shortcuts for the common actions, and pointer hover.
- **Android release.**
  - Google Play and F-Droid.
  - The F-Droid build has no Google Play Services or Firebase dependency: notifications are local only, as today.
- **Go/no-go gate.** The switch happens only when all of these hold:
  - the TestFlight build has run at least two weeks with testers;
  - there is no open data-loss or sync bug;
  - TestFlight's crash-free sessions are at least 99.5%;
  - the nightly app budgets pass;
  - the owner approves.
- **Switch-over.**
  - The native app ships under the existing records (`app.open-todo.ios` and the Android application id `app.opentodo`) as 2.0, the next major mobile version; it already uses both ids on TestFlight (`native-app-foundation` D10).
  - The server address the shell stored is read and prefilled, so people sign in once.
  - Local data comes back through the first sync.
  - `mobile/ios`'s web-view code and `mobile/android`'s shell are deleted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-app`: widget, share, device reminders and their actions, background refresh, biometric unlock, iPad layout, Android release, the switch-over.
- `native-shells`: the shells are replaced by the native app. Their requirements are retired at archive, with the replacement noted.

## Impact

- **Code:**
  - `mobile/app` (Expo modules for the App Group and widget reloads, background tasks, notifications);
  - `mobile/ios` keeps only the widget and share extension sources;
  - `mobile/android` keeps only the widget and share code moved into the app's config plugin;
  - `web/src/lib/shell.ts` and the bridge are removed after the switch, with their tests and fixtures.
- **CI:**
  - The `ios` and `mobile` lanes of `scripts/ci-changes.sh` fold into `app`. Net CI time goes down, because the shell jobs disappear.
- **Owner actions:** approve the gate, then promote releases in App Store Connect and Google Play as today.
- **Delayed notifications:**
  - A self-hosted server cannot reach Apple's or Google's push services for our app without the app's push credentials.
  - So notifications from other people (mentions, assignments) arrive at the next background refresh or when the app opens, not instantly.
  - This is stated in `docs/app.md`. A push relay is a separate decision (see design).

## Out of scope

- Siri, Shortcuts, the Action Button and Live Activities: `apple-shortcuts` and `focus-live-activity`, re-planned on the native app.
- A push relay for instant notifications from other people.
- Apple Watch, Wear OS, macOS Catalyst.

## Roadmap

Third and last change of the "Native app" area. It closes `ios-distribution` (#600) and `play-production` (#603) with the native app. It updates `apple-shortcuts` and `focus-live-activity` to build on it.
