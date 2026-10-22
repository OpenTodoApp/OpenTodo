# Proposal

## Why

The installed web app covers most of what a phone or desktop app does, but not the things people ask for in issue #105 and in the roadmap's set-aside list: home-screen widgets, reminders that fire whatever the browser's push service decides, sharing into OpenTodo from every app on iOS, unlocking an encrypted account with a fingerprint, and on a computer a tray icon and a server that just runs. The owner has publicly promised native shells around the existing app; this change decides how they are built, once, and ships the first one.

## What Changes

- **One architecture decision for every shell**, recorded in the design with a comparison: a hand-written shell per platform family (Kotlin and the system WebView on Android, Swift and WKWebView on iOS later, a Go desktop shell around the embedded server later) over Capacitor, Tauri and Electron. The web app stays the one product; a shell adds only what the browser cannot do.
- **The web app is never bundled.** A shell loads the app from the user's own server, like the installed web app does, so there is no version skew with the server, the service worker gives offline start, and sessions, storage and the capture screen keep their origin.
- **A bridge contract, `window.opentodoShell`**, versioned and optional: the web app discovers it, uses it for reminders, widgets, sharing files, biometric unlock and opening links, and behaves exactly as today when it is absent. The shell exposes the bridge only to pages of the configured server's origin.
- **The Android shell** in a new `mobile/android/` folder, a sibling of `extension/`: a first-run screen for the server address, the app in a full-screen WebView, offline start, Android's share sheet mapped onto the existing capture screen (text, links and files), reminders scheduled on the device from the app's own data and shown as system notifications without any push service, a Today widget and a quick-add widget fed by the app through the bridge, unlocking an encrypted account with the device's biometrics through an Android Keystore key, and a release pipeline (signed build in CI, Play Store and F-Droid readiness). The shell makes requests only to the user's server and collects nothing.
- **Reminders without web push** on a shell device: Settings → Notifications offers "Notifications on this device" through the shell instead of a push subscription, with the same test action and the same snooze and dismiss.
- **Follow-up changes named here and not built now:** `ios-shell` (Swift shell, App Store questions for an AGPL app, Apple Developer account, a macOS runner) and `desktop-shell` (a Go shell with the server embedded, tray icon, autostart, notarisation and code signing).
- No new mandatory environment variable, no op-log change, no change to the server binary or the container image. **Not BREAKING.**

Out of scope: the iOS and desktop shells themselves (follow-ups above), a widget that edits tasks without opening the app, background sync beyond what the reminder refresh needs, location-based reminders, a built-in server on the phone, publishing the shell in stores other than Google Play and F-Droid, and any change to the web push path for browsers.

ROADMAP: advances the set-aside "phone apps from the same web app" and "a desktop app for macOS and Windows", and answers issue #105. ROADMAP.md gains a "Native shells" table with the three changes when this one ships.

## Capabilities

### New Capabilities
- `native-shells`: the shell architecture and its guarantees (loads the user's server, contacts nothing else, collects nothing), the first-run server screen, offline start, the versioned `window.opentodoShell` bridge and the rule that the web app behaves identically without it, the Android share-sheet mapping, device-scheduled reminders, the widgets, biometric unlock, release and store readiness, and the CI job.

### Modified Capabilities
- `reminders`: "Notification settings" gains the shell path: on a shell device the per-device switch and the test action use the shell's notifications instead of a push subscription; snooze and dismiss from a shell notification write the same operations as today.
- `self-hosting`: "CI path filter covers every input" classifies `mobile/` so a change there runs the Android job (and only that job when nothing else changed).

## Impact

- New folder `mobile/android/` (Kotlin, Gradle, AndroidX only: `webkit`, `work`, `biometric`, `glance` or `RemoteViews`; no Capacitor, no third-party SDK), `mobile/README.md`, a `make android` target and an `android` CI job on the existing Ubuntu runners (Android SDK and JDK 17 via setup actions, about 4 to 6 minutes, cached).
- Web: a small bridge module `web/src/lib/shell.ts` with tests, used by the reminders scheduler, the notification settings, the capture screen, the Today view (widget data) and the encryption unlock screen. Expected main-bundle growth under 2 KB gzipped (measured in a task).
- Server: nothing. The shell uses the routes the web app already uses.
- Docs: `docs/install-phone.md` (Android app section), `docs/push-notifications.md` (notifications in the Android app), `docs/e2ee.md` (biometric unlock), `docs/capture.md` (share from the Android app), a new `mobile/README.md` for contributors, AGENTS.md layout line for `mobile/`.
- Release: a signed APK and AAB attached to tagged releases next to the extension zip, with build provenance like every other asset; Play Store and F-Droid listings as release steps outside CI.
