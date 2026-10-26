# Tasks

Shell tasks are verified with `make ios` (31 unit tests and 2 UI tests in `mobile/ios/OpenTodoTests/{ShellTests,ShellDataTests}.swift` and `mobile/ios/OpenTodoUITests/FirstRunTests.swift`, an unsigned device build and the dependency check). The web app is not touched, so `go test ./...` and `npm test` have nothing new to cover; `make check` still runs before the last task. The simulator cannot grant a notification permission, tap a share sheet or present Face ID, so a handful of tasks below are written and unit-tested but need the device run in section 9.

## 1. Skeleton, first run, offline behaviour

- [x] 1.1 Decide the stack and verify the platform APIs against the iOS 16.4 floor; record the measurements in design.md D1 to D3. Verified by the table in `design.md` "Context".
- [x] 1.2 Xcode project `mobile/ios/OpenTodo.xcodeproj` (XcodeGen spec `project.yml`), app target `app.opentodo`, the widget and share extensions, unit-test target, entitlements with the App Group, `PrivacyInfo.xcprivacy` (UserDefaults, no tracking, no collected data), Info.plist keys (`NSAllowsLocalNetworking`, `NSLocalNetworkUsageDescription`, URL scheme `opentodo`, background modes, `UIApplicationShortcutItems`). Verified by `make ios` building the app and running the tests, and by `PrivacyInfo.xcprivacy` landing in the built bundle.
- [x] 1.3 First-run screen with the address rules and the health check, mirrored from Android. Verified by `ServerAddressTests` (public https, plain http local only, `needsHttps` suggestion, refusals, local ranges) and `HealthCheckTests` (health answer, other answers, error classes).
- [x] 1.4 Web view: full-screen `WKWebView` on the configured origin, origin-locked navigation, foreign links and `target="_blank"` to the system browser, untrusted certificates refused, process termination reloaded, an offline screen until the page loads. Pull to refresh reloads the page. Verified by `OriginTests` (same-origin decisions, page origin) and a simulator run against a local server; the hand-off to Safari and a refused certificate are in the device run in section 9.
- [x] 1.5 The opt-in app-bound build (design D2): `OPENTODO_APP_BOUND_HOST` build setting, `WKAppBoundDomains` in the plist, `limitsNavigationsToAppBoundDomains` set only when the entered host is listed. Verified by `AppBoundDomainsTests` (the `none.invalid` placeholder is not a domain) and by a run of the real app: built with `OPENTODO_APP_BOUND_HOST=localhost`, loaded the server once, server stopped, relaunched — the web app came up from its precache and showed its own "OpenTodo can't reach the server" screen.

## 2. The bridge

- [x] 2.1 `window.opentodoShell` for pages of the configured origin only: `bridge: 1`, `platform: "ios"`, `app` from `CFBundleShortVersionString`, `capabilities`; injected at document start, replies through one message handler that refuses any frame whose origin is not the configured one. Verified by `BridgeTests` (the script names the configured origin, carries platform, version and capabilities) and by a simulator run in which the web app itself published a widget through the bridge: the probe read `{"present":true,"platform":"ios","bridge":1,"capabilities":["reminders","widgets","share","links"]}` and `widget.json` appeared in the App Group.
- [x] 2.2 The bridge's method set is the Android one: `scheduleReminders`, `testNotification`, `publishWidget`, `biometricStore`, `biometricRead`, `biometricForget`, `openExternal`; no capability is claimed before it is implemented. Verified by `BridgeTests` (capability list with and without biometrics) and by `web/src/lib/shell.ts` staying unchanged.
- [x] 2.3 Reject anything malformed: a message over 2 MB, an unknown method, an `openExternal` URL whose scheme is not `https`/`http`/`mailto`/`tel`, and a frame that is not the main frame of the configured origin. Verified by `BridgeTests` (`safeExternal` allows and refuses) and the origin comparison test that caught the first two bugs in this handler.

## 3. Reminders

- [x] 3.1 `scheduleReminders`: permission request once, the schedule sorted and cut to the 64 pending notifications iOS allows, one local notification per reminder with `userInfo` carrying the reminder and task id, titles only when handed over. Verified by `ReminderTests` (past entries dropped, sorted, capped, junk refused).
- [ ] 3.2 Snooze 10 min and Dismiss as notification actions that open the web app on `/?reminder=<id>&action=snooze|dismiss`, and a tap on `/?task=<id>`. Written (`Reminders.registerCategory`, `AppModel.handle(url:)`); needs the device run in section 9 — no simulator command can grant the notification permission.
- [x] 3.3 `BGAppRefreshTask` (identifier `app.opentodo.refresh`) runs the web app hidden for at most 30 seconds to refresh the schedule, and asks for the next run with `earliestBeginDate` an hour later — documented as best effort, not a guarantee. Verified by `BackgroundRefreshTests` (the identifier and the one-hour interval). The simulator cannot schedule one at all — `BGTaskScheduler.submit` answers `BGTaskScheduler is not available on this platform.` (`BGTaskSchedulerErrorDomain` code 1) — so the run itself is only checkable on a device (9.6).
- [x] 3.4 The schedule is deleted when the server changes (`AppModel.forgetServer` clears notifications, widget data, share inbox and the biometric key). Verified by reading the four calls in `AppModel.forgetServer`; the notification centre itself has no unit test.

## 4. Share

- [x] 4.1 Share extension for text, links and files, writing into the App Group and opening the app on `opentodo://share`. Verified by `make ios` building the extension, and by `ShareInboxTests` (an entry with a real file becomes a `data:` URL message).
- [x] 4.2 Files handed over with the same `opentodo-files` `postMessage` the browser extension uses, at most 10 files and 25 MB together (each within the server's per-file limit); the shared container is emptied after the hand-over. Verified by `ShareMapTests` (limits, `files=1`, the repost script) and `ShareInboxTests` (an entry over the limit yields no message).
- [ ] 4.3 A share that arrives before a server is configured waits, and continues on the capture screen once the address is saved. Written (`AppModel.handle(url:)` reads the inbox whenever `opentodo://share` arrives); needs the device run in section 9.

## 5. Face ID

- [x] 5.1 `biometricStore`/`biometricRead`/`biometricForget` over a Keychain item protected by `kSecAccessControlBiometryCurrentSet`; `biometric` only in `capabilities` when biometrics are enrolled. Verified by `BiometricKeyStoreTests` (32-byte keys accepted, other lengths and junk refused, the capability follows `LAContext`).
- [ ] 5.2 The stored key is deleted on lock, sign-out, server change, passphrase change, encryption turned off and when the enrolment changes. The server-change and sign-out paths are in `AppModel.forgetServer`; the round trip and the enrolment-change invalidation need the device run in section 9.

## 6. Widget

- [x] 6.1 `publishWidget` writes the published JSON into the App Group and reloads the widget timeline; the Today widget draws from that file only (medium family: count in the header, up to 5 tasks with time and priority, the update time in the footer), shows counts only when `locked`, and a tap opens `opentodo://task/<id>`. Verified by `WidgetPublicationTests` (publish/load round trip, an empty object refused) and by the web app publishing into `widget.json` in the simulator; adding the widget to a Home Screen is in the device run in section 9.
- [x] 6.2 The widget never makes a request of its own. Verified by reading `OpenTodoWidget/TodayWidget.swift`: it only decodes `WidgetPublication.load()`.

## 7. Build, tests and CI

- [x] 7.1 `make ios` runs the unit tests and a simulator build without signing, and prints the app's size and the version; the target is not part of `make check`. Verified by `make ios` on a Mac (31 unit tests, 2 UI tests, 1 MB app, no third-party libraries) and by `make check`'s target list staying unchanged.
- [ ] 7.2 A CI job builds `mobile/ios` for pull requests that touch `mobile/ios/**` and on tags, on a macOS runner, unsigned. The job and the `ios` path filter are in place and `scripts/repo-checks.test.mjs` covers the filter; the first green run happens with this change.
- [x] 7.3 Version from `OPENTODO_VERSION`, `CFBundleVersion` as `major·10000 + minor·100 + patch`, `0.0.0-dev` locally — the same rules as Android. Verified by `VersionTests`.
- [x] 7.4 No third-party dependency: the app links only system frameworks. Verified by the `otool -L` check in `make ios`.
- [x] 7.5 The shell's own strings live in a String Catalog with the same five languages the web app ships, checked on Linux like `web/src/locales` is: every key translated, none empty, the format specifiers intact. Verified by `scripts/i18n/shell.test.mjs` and by `make i18n-check`, which is part of `make check`.

## 8. Documentation

- [x] 8.1 `docs/ios-app.md` (what the app adds, first run, the offline limitation of the portable build and how to build the one-server variant, sharing, reminders and their limits, the widget, Face ID, changing the server), linked from `docs/install-phone.md` and `docs/capture.md`. Verified by `npm run docs:check`.
- [x] 8.2 `mobile/README.md` gains the iOS sections with the file map, the bridge notes and the build steps. Verified by `npm run docs:check`.
- [x] 8.3 CHANGELOG entry under Unreleased, and `ROADMAP.md:188` row 2 updated to say what shipped and what stayed open. Verified by `make check`.
- [x] 8.4 Both ways of signing for a device are written down, because the App Groups capability the widget and the share extension share data through is paid-only: a free Apple ID signs the app once the two extensions and the App Group are removed, a paid membership keeps them. Verified by `npm run docs:check`; the steps themselves belong to the runs in section 9, which have not been performed here.

## 9. Runs that need a device

The same table is in `mobile/README.md` and gets a row per run: phone, iOS version, server version.

- [ ] 9.1 First run against a real server over https, then a foreign link and a certificate the phone does not trust (both must be handed off/refused, never bypassed).
- [ ] 9.2 A reminder firing with the app closed, then Snooze and Dismiss from the notification, then a tap opening the task.
- [ ] 9.3 A share of a link and of two photos from another app, including one that arrives before a server is set.
- [ ] 9.4 The Today widget on a Home Screen, updated after a change made on another device.
- [ ] 9.5 Face ID unlock of an encrypted account, and the key becoming unusable after a re-enrolment.
- [ ] 9.6 A background refresh actually running — the only place it can be observed, since the simulator reports `BGTaskScheduler is not available on this platform.` Use Xcode ▸ Debug ▸ Simulate Background Fetch on the device and look for `app.opentodo.refresh` in the console.
