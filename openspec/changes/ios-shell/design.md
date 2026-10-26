# Design

## Context

`native-shells` decided the shape: a thin, hand-written shell per platform, loading the web app from the user's own server, exposing one versioned bridge (`web/src/lib/shell.ts`), never bundling the web app (design D1 to D3 there). The Android app is in `mobile/android` and waits only for its store listings. This change adds the iOS sibling and had to answer the three questions that change left open.

Everything below was measured on 2026-10-26 with Xcode 27.1 (build 27A9275), the iOS 27.1 SDK and an iOS 27.0 simulator, against `ghcr.io/pixari/opentodo:stable` (v0.14.0) on `http://localhost:8080`. The probe app is stock: a `WKWebView`, no `WKAppBoundDomains` unless stated, `navigator.serviceWorker` inspected from a `WKUserScript`.

| Configuration | `'serviceWorker' in navigator` | Service worker active | Offline start |
| --- | --- | --- | --- |
| No `WKAppBoundDomains` (default) | **false** (`navigator.serviceWorker` is `undefined`) | no | no |
| `WKAppBoundDomains = [localhost]`, `limitsNavigationsToAppBoundDomains = true` | true | yes, `workbox-precache-v2-…` with 126 entries | **yes** |
| Key present, `limitsNavigationsToAppBoundDomains = false`, page on an origin **not** in the list | **false** | no | no |

Other numbers from the same runs: `isSecureContext` is true in every case (the simulator reaches `http://localhost`, a secure context); `navigator.storage.persisted()` is `false`; `navigator.storage.estimate().quota` is 10.3 GB; the first activation of the service worker took tens of seconds (a registration existed with `active: null` at 25 s, and activated afterwards while it precached 126 files); `caches` works with or without a service worker.

The offline probe: with `localhost` in the app-bound list, once the web app had loaded, the container was stopped (`docker stop`), the app was terminated and relaunched. The shell rendered the web app from the precache and the web app showed its own screen *"OpenTodo can't reach the server. Sign in once while online; after that the app works offline."* — the same behaviour as the installed web app.

## Goals / Non-Goals

**Goals:**
- The same capabilities as the Android shell that iOS can carry: share sheet, reminders without a push service, a Today widget, Face ID unlock, and the same bridge version 1.
- The user's server only, nothing collected, nothing bundled, no new server surface.
- A build a maintainer can reproduce: open `mobile/ios/OpenTodo.xcodeproj`, pick a team, run. `make ios` for CI.
- Write down, rather than paper over, where iOS is weaker than the installed web app.

**Non-Goals:**
- Parity with Android where the platform does not allow it: no exact alarms, no hourly background run, no quick-add widget (WidgetKit has no text field).
- App Store publication (D7), APNs push (D3), rebranding or native screens.

## Decisions

**D1. Swift and `WKWebView`, no third-party dependencies** — the platform APIs are the ones we need (`UNUserNotificationCenter`, `BGTaskScheduler`, `Keychain`/`LocalAuthentication`, `WidgetKit`, a share extension), each is a few dozen lines, and a wrapper framework would add a runtime, a licence and an upgrade treadmill for nothing. This is `native-shells` D1 applied to iOS, with no new reasoning beyond confirming that every API needed here exists in the iOS 16.4 minimum (they do; the floor matches the installed web app's push support).

**D2. Offline start is opt-in and needs the server's host at build time.**

The tables above are the whole decision. A service worker — and with it the precache that the offline requirement is built on — only exists on an origin listed in `WKAppBoundDomains`, and that list is Info.plist, i.e. fixed at build time. So:

- **Portable build (default).** No app-bound domains. Any https address works, the bridge works for it, the web app runs; when the server cannot be reached the shell shows "no connection, retry" instead of the app. This is the case the offline requirement cannot satisfy, so the spec now says so for iOS.
- **One-server build (opt-in).** Set `OPENTODO_APP_BOUND_HOST` to the server's host (`todo.example.com`, no scheme, no port) in the build settings; the plist then lists it, and the shell sets `limitsNavigationsToAppBoundDomains = true` only when the entered address matches a listed host. Offline start, precache and the installed-web-app behaviour come back. Nothing else in the code differs.

The alternative — app-bound domains always on, with a placeholder domain — was rejected because it would make the default build refuse every server that is not the placeholder (`limitsNavigationsToAppBoundDomains` blocks navigation to other origins) and, per WebKit's documentation, deny the bridge outside the listed origins. Both modes share one code path and are checked in the shell's own tests.

Honest consequence, stated to the user in `docs/ios-app.md`: for offline use the installed web app (Add to Home Screen) already does the job on iOS 16.4+, and it has push. The shell's reason to exist is the share sheet, Face ID and the widget.

**D3. Reminders: `UNUserNotificationCenter` from the published schedule, refreshed when the system says so.**

The web app hands over the next 7 days of reminders through `scheduleReminders`, as on Android; the shell schedules one local notification each, with Snooze 10 min and Dismiss actions that open the web app in the background and run the app's own reminder operations (the same trick as Android's `HiddenRun`), and a tap opening `/?task=<id>`. Three platform limits shape it, and the spec states them:

- **At most 64 pending notifications per app.** The handed-over schedule is sorted by firing time and cut to the first 64; the web app is told the rest could not be scheduled by the same `exact-denied`-free answer it already understands (`granted`, since nothing is refused).
- **No hourly guarantee.** `BGAppRefreshTask` with `earliestBeginDate` is a hint: iOS decides from usage patterns, and a rarely opened app can go days. So a reminder created on another device may not fire on this one until the app is opened. Android's WorkManager hourly job has no equivalent; the spec no longer claims one for iOS.
- **No exact-alarm permission is needed**, unlike Android: a local notification fires at its time without a permission beyond the notification grant. iOS is the easier platform here.

Rejected: APNs (needs a server sender, a new credential per instance and a store app), and polling the REST API natively (a second API client, a second auth path, and it would bypass the app's own encryption handling).

**D4. Navigation is origin-locked.** The web view may only navigate within the configured origin's scheme, host and port; everything else (`http`, `https`, `mailto`, `tel`) opens in the system browser, and `targetFrame == nil` (a `target="_blank"` link) goes there too. This is `MainActivity`'s rule and keeps the bridge from ever meeting a foreign page. Server-trust challenges are cancelled, never bypassed: a certificate the device does not trust is refused with an explanation, which matches the Android network security config.

**D5. Share sheet: a share extension writes to the App Group, the app picks it up through a URL.** Text, links and files; the extension copies files into the shared container (the web app's limits stay authoritative: at most 10 files, each within the server's per-file limit, 100 MB together — `MAX_SHARED_FILES` in `web/src/lib/share.ts`, `SHARE_MAX_BYTES` in `web/src/lib/shareInbox.ts`), then opens `opentodo://share?files=1`, which the shell turns into `/share?title=…&text=…&url=…&files=1` and completes with the same `opentodo-files` `postMessage` the browser extension uses. A share extension cannot call `UIApplication.open`; the container app is opened through the responder chain's `openURL:`, which is why this is not App Store material as written (D7) — worth knowing before anyone tries to publish it.

**D6. Biometrics: Keychain item with `kSecAccessControlBiometryCurrentSet`.** The account key is stored as a Keychain item that only a successful biometric prompt unlocks, and an enrolment change invalidates it — the iOS equivalent of Android's `setInvalidatedByBiometricEnrollment`. `biometric` is listed in `capabilities` only when `LAContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)` is true, so the web app never offers an unlock it cannot do.

**D7. Distribution: source, built by whoever runs it. No store.** AGPL-3.0 and Apple's terms have never been reconciled for a store listing without a permission from every copyright holder (the reason `native-shells` design.md:12 left this open), and this repository has no Apple Developer account. So the shell is source in `mobile/ios`, built in Xcode with the user's own team, exactly like `make android`'s debug APK. `make ios` therefore runs tests and a simulator build, never signing, and must not be part of `make check` on Ubuntu — a separate target, plus a CI job that only runs for changes under `mobile/ios/**` (as the Android job does for `mobile/android/**`).

**D8. Widget: WidgetKit, Today only, drawn from the published JSON.** The web app already publishes `{updatedAt, locked, count, overdue, tasks: […]}` at most 50 tasks (`web/src/lib/shellPublish.ts`); the shell writes it to the App Group and reloads the timeline on publish. The widget draws from that file only, shows the update time, and shows counts only when `locked`. A quick-add widget is impossible (no text input in WidgetKit), so `widgets` keeps meaning the Today widget and the spec says so.

**D9. The shell's version is the release version**, `major·10000 + minor·100 + patch` as `CFBundleVersion`, `OPENTODO_VERSION` from the environment when CI sets it, `0.0.0-dev` otherwise — the same rules as Android, so `MIN_SHELL_APP` comparisons in the web app behave identically.

**D10. The shell's own strings are checked like the web app's.** Everything the shell itself says (the first-run screen, the failure screens, the widget, the notification actions) lives in `mobile/ios/Shared/Localizable.xcstrings` with the same five languages the web app ships. `scripts/i18n/shell.mjs` checks it inside `make i18n-check` — a key in the catalog must exist in each language, be marked `translated`, not be empty, and keep the source's format specifiers — so a missing German sentence fails `make check` on Linux rather than a review. The web app's own text is not duplicated: the shell only owns what it draws outside the web view.

## Data model impact

None. No op, field, route or migration. The shell stores: the server address (`UserDefaults`), the last handed-over reminder schedule and widget publication (`App Group`), the biometric key (Keychain), and the web app's own origin storage (WebKit, as in a browser).

## Size

No dependency is added, so there is no image, binary or memory change on the server. The app itself: the shell is SwiftUI and system frameworks, roughly 1.5 MB of code and assets plus the system's WebKit — for scale, the Android app is about 1 MB of APK. Measured build output goes in `tasks.md` when the target is complete.

## Risks

- **The portable build has no offline start** (D2). This is the requirement most visible to a user, and it cannot be fixed without knowing the host at build time. Mitigation: the opt-in build, the docs, and the spec delta saying it out loud.
- **Reminders can be stale** (D3) and, past 64 pending items, incomplete.
- **No push** in the web view, so this shell is not a notification replacement for the installed web app.
- **The share extension's `openURL:`** is the one technique here that a review would flag; irrelevant without a store, but it must not be copied into anything that targets one.
