# Design

## Context

- **The current shells.**
  - The iOS shell has a Swift widget (`TodayWidget.swift`) that reads a JSON snapshot from the App Group (`WidgetPublication.swift`, written via the bridge).
  - Its share extension writes to an App Group inbox that the web app drains (`ShareInbox.swift`, `web/src/lib/shareInbox.ts`).
  - Reminders are scheduled as local notifications by the shell (`Reminders.swift`), and a `BGAppRefreshTask` exists.
  - Android mirrors all of this in Kotlin.
- **What testers reported.** The widget went stale and push was unreliable. They also asked about the iPad.

## Decisions

### D1. Keep the Swift and Kotlin extensions; replace the bridge with an Expo module

- **Extensions.** The widget and share extension stay native code. They move under `mobile/app/targets/` and join the generated project through a config plugin (`@bacons/apple-targets` on iOS, a small in-repo plugin for the Android widget receiver). Their sources are reused as they are.
- **The data path.** A local Expo module, `opentodo-shared-container`, writes and reads the App Group (`UserDefaults(suiteName:)` and files) and calls `WidgetCenter.reloadTimelines`. On Android it is SharedPreferences plus a widget update broadcast.
- **The snapshot.** Its JSON is the one `shellPublish.ts` produces today, kept as a shared fixture, so the widget code needs no change.

### D2. When the widget refreshes

- **When the app publishes.** After each committed local change that touches Today (debounced 1 s), after each sync that changes Today, and at the end of each background refresh.
- **Staleness.** The snapshot carries its time, and the widget shows "Updated 10:42" when it is more than an hour old, so a stale widget is honest.
- This addresses the reported staleness, which came from the shell publishing only while the web view was alive.

### D3. Reminders

- **The window.** The app computes the next reminders with the shared rules (`reminders`, `reminderTime`, `defaultReminder`) and schedules the next 60 on iOS, below the 64 limit, as local notifications through `expo-notifications`, configured without remote push.
- **Rescheduling.** It reschedules after each change to a reminder and after each sync. Background refresh tops up the window.
- **Actions.** Notification actions are Complete and Snooze 10 min. Each writes an op through `mutate()` from the notification response handler, even when the app was not running.
- **One device fires.** As today, a reminder is fired by the device and never also pushed by the server to the same device, using the existing device-ownership rule of `reminders`.

### D4. Notifications from other people

The server already sends Web Push. Native push needs APNs and FCM credentials that belong to the app, which a self-hosted server does not have.

| Option | Instant | Privacy | Operation |
|---|---|---|---|
| A. Background refresh plus local notifications | No (minutes to hours, the system decides) | Nothing leaves the user's server | None |
| B. A push relay run by the project | Yes | Payload-free wake-ups only, no content | A service to run: against "no third-party calls by default" |
| C. The owner uploads their own APNs key | Yes | Direct | Needs their own build: not workable for a store app |

**Decision: A** now, stated plainly in the docs. B is a separate, opt-in decision for the owner later. It would be off by default, carry no content, and would need its own change.

### D5. Biometric unlock

- **Turning it on.** After a passphrase unlock, the user can turn on Face ID or fingerprint. The data key is wrapped with a key in the Secure Enclave or StrongBox (via `expo-secure-store` with `requireAuthentication`) and stored there.
- **Cold start.** It prompts the biometric, unwraps the key, and holds it in memory only.
- **Fallback.** Turning biometrics off, or the system invalidating the key after a biometric change, falls back to the passphrase. This matches the shell's existing behaviour (`BiometricKeyStore.swift`).

### D6. iPad

- **Regular width:**
  - a three-column split view, with Browse's destinations as the sidebar, the list, and the detail;
  - hardware keyboard shortcuts through `UIKeyCommand` (N new, ⌘F search, Space complete, ⌘1–5 tabs, arrows to move);
  - pointer hover effects;
  - drag a task onto a sidebar project to move it.
- **Compact width.** Slide Over and narrow split screen use the iPhone layout.
- This answers the iPad question testers asked, and keeps iPad users from losing their layout at the switch.

### D7. The go/no-go gate and the switch

- **The gate** is a checklist in `RELEASING.md`, signed off by the owner in the release pull request:
  - two weeks of the preview with testers;
  - no open data-loss or sync issue;
  - TestFlight's crash-free sessions at least 99.5% (Apple's own reporting, no telemetry of ours);
  - the nightly app budgets green;
  - the everyday Maestro suite green on the last three nightly runs.
- **The switch:**
  - The native app takes the existing bundle id and application id, with version code and build numbers above the shell's.
  - On its first launch it reads the server address the shell stored (App Group `serverURL` on iOS, SharedPreferences on Android), prefills it and asks to sign in once.
  - The web-view cookies cannot be reused, and that is stated on the screen.
- **Local data.** It is downloaded again by the first sync. The shell's IndexedDB is not migrated: the server holds everything, and unsent shell ops are flushed by the shell's last version.
- **The shell's last release.** It shows a notice that the next update is the new app, and pushes its outbox before updating. It ships two weeks ahead of the switch.

### D8. Android distribution

- **Google Play.** It takes the AAB from `app-android`, through the existing `play-production` path.
- **F-Droid.**
  - It builds from source. The app avoids Google Play Services and Firebase in every module (`expo-notifications` configured local-only), and a CI check scans the Gradle dependency tree for them.
  - Reproducible-build notes in `docs/android-reproducible.md` are updated for the React Native toolchain.
  - The F-Droid metadata (`fastlane/`) keeps its place.

### D9. What is deleted at the switch

- `mobile/ios`: everything but the widget and share sources, which move to `mobile/app/targets`.
- `mobile/android`: the shell, with its widget and share code moved.
- `web/src/lib/shell.ts`, `shellPublish.ts`, `shellActions.ts`, the bridge fixtures, the shell's CI lanes and `ios-walkthrough.yml`.

`docs/ios-app.md` and `docs/install-phone.md` are rewritten for the native app.

## Data model

None.

## Size and memory

No server or web change, except that the web app gets smaller when the bridge code is removed. The app grows by the extensions' size, about 1 MB.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **People lose instant notifications from others.** | The current shell does not deliver them reliably either. D4 states the limit, and a relay is an explicit later choice. |
| **The switch forces one sign-in.** | The address is prefilled, and the notice in the shell's last release explains it ahead of time. |
| **iPad work grows the change.** | The split view uses `react-native-screens`' native split view, and only the iPhone's screens are composed. No iPad-only screens. |

## Migration Plan

Work goes from the extensions, reminders and background refresh, to biometrics, to iPad, then Android. Then the gate, the shell's last release, the switch release and the deletion.
