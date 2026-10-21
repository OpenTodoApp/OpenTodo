# Design

## Context

See proposal.md for the motivation. Current state that shapes the approach:

- The web app is an installable PWA: Workbox service worker with a precached shell, a web share target on `POST /share` answered by the service worker, web push (VAPID keys in `internal/push`, RFC 8291 payloads, the handler in `web/public/push-sw.js` that reads the local IndexedDB and writes snooze and dismiss as ordinary reminder ops into the outbox), a phone layout with a bottom tab bar and a floating add button (`app-shell` "Phone navigation"), and a `minClientVersion` in the profile for recovery after a server upgrade.
- An encrypted account keeps its account key non-extractable in IndexedDB (`web/src/lib/e2ee.ts` `storeKey`); `crypto.ts` can unwrap the key extractable "only for the moment a re-wrap needs it".
- The browser extension (`extension/`) is the precedent for a sibling folder: plain code, its own tests, a `make extension` target, a CI job that zips it and attaches it to releases, and a contract with the capture screen (`window.postMessage({type: 'opentodo-files', …})` accepted once, same window and origin, only with `files=1`).
- CI runs on Ubuntu only; there is no macOS runner, no Apple Developer account and no Play Console account in the repository today. Releases attach assets with build provenance (`self-hosting` "Gated and verifiable releases").
- Android WebView (Chromium-based) supports service workers, IndexedDB, `navigator.share` is irrelevant (we receive shares, not send), but has **no Push API**: web push cannot work inside a WebView. Android widgets cannot read a WebView's IndexedDB; they read app-private storage. Exact alarms need `SCHEDULE_EXACT_ALARM` (Android 12+) or `USE_EXACT_ALARM` for alarm-clock-type apps; notifications need `POST_NOTIFICATIONS` (Android 13+). These platform facts are to be re-verified against the current SDK in task 1.1.
- AGPL-3.0: the shell is part of the same work and ships under AGPL; Google Play accepts AGPL apps, F-Droid prefers them. Apple's App Store terms have historically been held incompatible with GPL-family licences without an additional permission from every copyright holder (the VLC precedent); this is why iOS is a follow-up with that question first.

## Goals / Non-Goals

**Goals:**
- Decide the stack once for mobile and once for desktop, with the reasons written down.
- An Android app a self-hoster can install from Play or F-Droid that adds widgets, dependable reminders, the share sheet and biometric unlock, and otherwise is the web app.
- No new server surface, no new credential, nothing leaves the device except requests to the user's server.
- A bridge the iOS and desktop shells reuse unchanged.

**Non-Goals:**
- A second product: no screen is rebuilt natively (the first-run screen and the widgets are the only native UI).
- Background sync for its own sake; the hourly refresh exists only to keep reminders and widgets current.
- Supporting Android WebView versions that lack service workers (Android 7 and older WebViews); the minimum is Android 8 with an updatable WebView (verified in task 1.1).

## Decisions

**D1. Mobile stack: hand-written shells, Kotlin on Android and Swift on iOS, over Capacitor and Tauri mobile.**

| Criterion | Hand-written (Kotlin + `WebView`, Swift + `WKWebView`) | Capacitor | Tauri (mobile) |
| --- | --- | --- | --- |
| What we need natively | share receiver, alarms and notifications, widgets, keystore and biometrics, a first-run screen: each is a platform API, about 1,500 lines per platform | the same code, as custom plugins, plus Capacitor's own runtime and plugin API | the same code as Rust or platform plugins, plus a Rust toolchain |
| Loads the app from the server | yes, a `WebView` on a URL | designed to bundle the web app from `dist/`; loading a remote server URL is supported (`server.url`) but the plugin bridge and live reload assume the bundled model | designed to bundle; remote URL is possible but second-class |
| Dependencies and licence | AndroidX libraries only (Apache-2.0); iOS: none | npm `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` (MIT) and a plugin per feature, each a Gradle and CocoaPods dependency | Rust crates (MIT/Apache), the Tauri CLI, platform plugins; mobile support is newer and moves fast |
| Size (to verify, task 6.4) | APK about 2 to 4 MB | about 5 to 8 MB with the runtime | small binary, but the Rust toolchain in CI |
| CI | Gradle on Ubuntu; iOS later needs a macOS runner either way | Gradle plus npm, same runners | Rust plus Gradle; cargo cache |
| Maintenance | two small codebases in the platform's own language, nothing to upgrade but the SDKs | Capacitor major versions every year with plugin migrations | Tauri mobile API churn |
| "Keep it small" | the smallest surface and no runtime we do not use | a runtime whose main value (bundled app, plugin ecosystem) we do not use | a toolchain the repository does not have |

Chosen: hand-written. The decisive point is that we do not bundle the web app (D3), which removes most of what Capacitor and Tauri give, and every feature we want is a platform API we would write as a plugin anyway. The cost is writing Android and iOS twice; the bridge contract (D5) keeps that to the thin platform layer.

**D2. Desktop stack (decided here, built in `desktop-shell`): a Go shell around the embedded server, using the system WebView, over Tauri and Electron.** The server is Go and already embeds the web app; the desktop app is that binary plus a window, a tray icon, autostart and native notifications. Options: Wails (Go, MIT, system WebView via WebView2 on Windows and WebKit on macOS, a tray in v3; one binary of about 10 to 15 MB), the `webview/webview` Go binding (smaller, no tray or menus, cgo), Tauri (Rust toolchain plus the Go server as a sidecar; two toolchains in one app), Electron (bundled Chromium, 100 MB or more, rejected by size and "keep it small"). Chosen for the follow-up: Wails if its v3 is stable when `desktop-shell` starts, else the `webview/webview` binding with a small tray library; the follow-up change makes that call with a build in hand. The desktop shell embeds the server, so it is the one shell that bundles the web app, and the one place where "nothing to run" is literally true: data under the user's profile directory, the same backups and export.

**D3. Load the web app from the server, never bundle it.** The WebView navigates to the configured server; the service worker precaches the shell for offline starts. Why: one origin means sessions, cookies, IndexedDB, the service worker, CSP and the capture screen all work as in the installed web app; the server serves the client that matches it, so there is no shell-release-versus-server-release skew and `minClientVersion` stays the one mechanism; the shell needs no release when the web app changes. Bundling (an `appassets.androidplatform.net` origin or a custom scheme) would need its own session handling, a CORS surface on the server, a second update channel and skew rules. Cost: the first start needs the network, and an operator's broken certificate blocks the app until fixed; both are stated in the spec. Trust: Android's network security configuration trusts system and user certificate stores (`<certificates src="user"/>`), so a private authority installed on the device works; untrusted certificates are refused, never bypassed.

**D4. Reminders are scheduled on the device by the web app's own data, with a background refresh that runs the web app.** The WebView has no Push API, so web push is out. Alternatives: (a) UnifiedPush: a user-installed distributor app and a server-side sender; a third party in the path and a new server integration, rejected for now. (b) A REST read with the WebView's session cookie from native code: duplicates the reminder logic in Kotlin and reads only ciphertext for encrypted accounts, rejected. (c) A widget token: a new credential to revoke and protect, rejected. Chosen: the web app, when the bridge has `reminders`, calls `opentodoShell.scheduleReminders(json)` with the next 7 days of reminders (id, task id, fire time, optional title) every time the local reminder set changes; the shell stores them in app-private storage and schedules exact alarms (`AlarmManager.setExactAndAllowWhileIdle`, with the `SCHEDULE_EXACT_ALARM` permission flow, falling back to inexact alarms when refused and saying so in Settings). A `WorkManager` periodic job (every hour, network required) opens the web app in a hidden WebView for up to 30 seconds so it syncs and republishes the schedule and the widget data, then stops; on an encrypted account that works because the key is in the WebView's IndexedDB (and not at all while locked, by design). Snooze and dismiss open the app in the background at `/?reminder=<id>&action=snooze|dismiss`, which the web app handles through the same path as a notification click in `push-sw.js`, so the ops are ordinary and reach every device. The test notification is `opentodoShell.testNotification()`.

**D5. The bridge.** Injected with `WebViewCompat.addWebMessageListener` restricted to the configured origin (so no other page sees it), wrapped on the page side into `window.opentodoShell` by a script the shell injects at document start on that origin only. Version 1: `bridge`, `platform`, `app`, `capabilities: ("reminders" | "share" | "widgets" | "biometric" | "links")[]`, methods `scheduleReminders(json)`, `testNotification()`, `publishWidget(json)`, `biometricStore(keyB64)` and `biometricRead()` (promise-returning through a reply message), `openExternal(url)`. The web app's `web/src/lib/shell.ts` exposes `shell()` returning `null` outside a shell and typed wrappers that check `capabilities`; every caller has a no-shell branch that is today's behaviour, and the unit tests run both. Files shared into the app reuse the extension's `opentodo-files` message, which the capture screen already accepts once, same window and origin, with `files=1`. External links (`target=_blank`, other origins) open in the system browser (`openExternal`), so a single sign-on provider page or a map link never carries the bridge.

**D6. Widgets.** `publishWidget(json)` carries the Today list (open tasks due today or earlier: id, title, time, priority, overdue flag; at most 50) and the counts; the shell stores it in app-private storage with the publication time and the device's lock state at the time, and renders with Glance (AndroidX) or `RemoteViews`; the widget never requests anything. The quick-add widget opens the app at `/?add=<text>`, which the web app treats as prefilled quick add (the same parameter the share target uses for text, see task 3.3). An encrypted account's titles are published only while unlocked; on lock the shell replaces the stored titles with counts.

**D7. Biometric unlock.** After a successful passphrase unlock on a shell with `biometric`, the unlock screen offers the biometric option. The web app unwraps the account key once more as extractable (the path `crypto.ts` already has for re-wraps), exports it raw, hands it to `biometricStore`, and drops the extractable copy. The shell encrypts it with an AES-GCM key in the Android Keystore created with `setUserAuthenticationRequired(true)` and `setInvalidatedByBiometricEnrollment(true)`, hardware-backed where available. `biometricRead` shows `BiometricPrompt` and returns the raw key, which the web app imports as non-extractable with `importAccountKey` and stores as a normal unlock. Trade-off: the key exists for a moment outside WebCrypto and at rest in Keystore-encrypted app storage; it never leaves the device and is deleted on every event the spec lists. Alternative rejected: storing the passphrase, which would make a stolen phone's passphrase recoverable with a biometric spoof and defeats the passphrase change.

**D8. Permissions and privacy.** `INTERNET`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` (re-arm alarms after a reboot), `USE_BIOMETRIC`. No location, no contacts, no storage permission (shares arrive as content URIs). The Play data-safety form and the F-Droid metadata declare no data collected and no third-party SDK; a test greps the dependency tree for any non-AndroidX artifact and fails.

**D9. Folder, build and CI.** `mobile/android/` with Gradle Kotlin DSL, `mobile/README.md`, `make android` (unit tests, lint, debug APK). CI: an `android` job on `ubuntu-latest` with `actions/setup-java` (JDK 17), `android-actions/setup-android`, Gradle caching; on tags it signs with a keystore from secrets and uploads the APK and AAB with provenance like the extension zip; the release job needs it. Path filter: `mobile/**` → `mobile=true`; the `changes` job gains the output. Estimated 4 to 6 minutes per run with a warm cache (measured in task 6.4). The server binary, the image and the web bundle do not change; the web bundle grows by the bridge module only (under 2 KB gzipped, measured).

**D10. Interface budget and stories.** The web side adds no chrome: the notification switch, the biometric option and the shell-version notice are rows inside existing settings sections and the unlock screen. The first-run screen and the widgets are native and get their own screenshots in `mobile/README.md`; the web rows get the usual Storybook states (shell present and absent) with baselines from the UI baselines workflow. No new shortcut.

**D11. Versioning.** The shell's version is the release version; the bridge version is independent and changes only when a method's shape changes. The server profile gains nothing; the web app compares the shell's `app` against a constant minimum it ships (bumped when a shell bug needs a forced update) and shows the Settings notice.

## Risks / Trade-offs

- [Exact alarms refused or restricted by the system] → inexact alarms as fallback, Settings says reminders may be late by up to a few minutes, the docs name the system setting.
- [Battery optimisation kills the hourly refresh] → alarms are scheduled 7 days ahead, so a missed refresh only delays reminders created elsewhere; the docs show the "unrestricted battery" setting; the refresh never runs more than once an hour.
- [WebView version differences across phones] → minimum Android 8 and an updatable WebView; the first-run check reads the WebView version and warns below the tested one; the layout check already covers Chromium.
- [Certificate problems on home servers] → clear reasons on the first-run screen, user-installed authorities trusted, never a bypass.
- [Key material outside WebCrypto for biometric unlock] → Keystore with user authentication required and enrolment invalidation, deletion on every listed event, the choice opt-in and explained.
- [Store policies] → no data collected, AGPL accepted on Play and F-Droid; the iOS question is explicitly deferred.
- [Two platform codebases] → both thin, both under the same bridge tests; the web app never branches on platform.

## Migration Plan

Nothing to migrate: no server change, no op change. The Android app is installed next to, or instead of, the installed web app; both share nothing on the device. Uninstalling removes the app's storage, the schedule and the stored key. Rollback is uninstalling.

## Open Questions

- Glance versus `RemoteViews` for the widgets (Glance is the AndroidX way but adds Compose runtime weight; decided by the measured APK size in task 4.4, without changing the spec).
- Whether the hourly refresh should be shorter while a reminder is due within the hour (an optimisation; the spec's "at least hourly" holds either way).
- Play Console and F-Droid submission are release steps outside CI; who holds the signing key and the Play account is a maintainer decision.
