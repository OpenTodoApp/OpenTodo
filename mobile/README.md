# OpenTodo native shells

Thin apps around the OpenTodo web app (OpenSpec change `native-shells`). A shell never bundles the web app: it loads it from the user's own server, so sessions, IndexedDB, the service worker and the capture screen work exactly as in the installed web app, and the shell needs no release when the web app changes. What only a native app can do (reminders without a push service, the share menu, widgets, biometric unlock) goes through a small, versioned bridge.

- `android/`: the Android app (Kotlin, one `app` module, AndroidX only). iOS (`ios-shell`) and desktop (`desktop-shell`) are separate changes.

## Building the Android app

Needs JDK 17 or later and the Android SDK (platform 35, build tools 35.0.0) with `ANDROID_HOME` set; the Gradle wrapper downloads Gradle itself (checksum pinned).

```sh
make android          # unit tests, lint, the checks below, debug APK and the instrumented-test APK
cd mobile/android && ./gradlew :app:assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

Without a local SDK, the image CI's tooling is closest to works too:

```sh
docker run --rm -v "$PWD:/r" -w /r ghcr.io/cirruslabs/android-sdk:35 make android
```

Checks that `make android` runs besides the unit tests and lint:

| Task | Fails when |
| --- | --- |
| `:app:checkDependencies` | the release runtime classpath holds anything but AndroidX and Kotlin (no third-party SDK, design D8) |
| `:app:checkTranslations` | a language (`values-de`, `-es`, `-fr`, `-it`, `-pt`) misses a key of `values/strings.xml` |
| `:app:checkStoreMetadata` | the manifest's permissions differ from `store/permissions.txt`, or a store listing language is missing |

The version comes from `OPENTODO_VERSION` (CI sets it from the tag; local builds are `0.0.0-dev`), the version code is `major·10000 + minor·100 + patch`.

## How it fits together

| File | What it does |
| --- | --- |
| `SetupActivity`, `ServerAddress`, `HealthCheck` | first-run screen: https, or http only for local addresses after a warning; `GET /healthz` names the failure (no network, not OpenTodo, untrusted certificate, refused) |
| `MainActivity` | the full-screen `WebView` on the configured origin; other origins open in the browser; file chooser; back; shares; "Change server" (long-press the app icon) |
| `Bridge` | the bridge, injected with `WebViewCompat.addWebMessageListener` and `addDocumentStartJavaScript`, both restricted to the configured origin |
| `ReminderSchedule`, `Reminders.kt` | the handed-over schedule, exact alarms (inexact when refused), notifications with Snooze 10 min and Dismiss, re-arming after a reboot |
| `HiddenRun` | the hourly refresh and notification actions: the web app in a hidden `WebView` for at most 30 seconds |
| `WidgetModel`, `Widgets.kt` | the Today and quick-add widgets (`RemoteViews`), drawn from the last publication only |
| `BiometricKeyStore` | the account key under a Keystore AES-GCM key that needs a strong biometric for every use and is invalidated by an enrolment change |

Certificates: `res/xml/network_security_config.xml` trusts the system and the user-installed authorities, nothing else; an untrusted certificate is refused, never bypassed. Android backup and device transfer exclude everything the app stores.

## The bridge, version 1

`window.opentodoShell` exists only on pages of the configured server's origin. The web side is `web/src/lib/shell.ts`; a method the shell does not list in `capabilities` is never called, and without the bridge the web app behaves as in a browser.

| Member | Capability | Shape | Notes |
| --- | --- | --- | --- |
| `bridge` | | `1` | changes only when a method's shape changes |
| `platform` | | `"android"` | |
| `app` | | `"0.10.0"` | the shell's version; Settings → About warns below the web app's `MIN_SHELL_APP` |
| `capabilities` | | `string[]` | `reminders`, `widgets`, and in the visible app `share`, `links`, `biometric` (when a strong biometric is enrolled) |
| `scheduleReminders(json)` | `reminders` | `→ Promise<"granted" \| "denied" \| "exact-denied">` | `[{id, taskId, fireAt, title?}]`, the next 7 days; replaces the stored schedule; asks for the notification permission once, opens the exact-alarm setting once |
| `testNotification()` | `reminders` | `→ Promise<boolean>` | shows a notification now |
| `publishWidget(json)` | `widgets` | `void` | `{updatedAt, locked, count, overdue, tasks: [{id, title?, time?, priority, overdue}]}`, at most 50 tasks; `locked` means counts only |
| `biometricStore(keyB64)` | `biometric` | `→ Promise<boolean>` | 32-byte raw account key; shows the biometric prompt |
| `biometricRead()` | `biometric` | `→ Promise<string \| null>` | the key after the prompt; `null` when cancelled, never stored or invalidated |
| `biometricForget()` | `biometric` | `void` | deletes the stored key |
| `openExternal(url)` | `links` | `void` | http(s), `mailto:` and `tel:` in the system browser or app |

Addresses the shell opens in the web app: `/?task=<id>` (a notification tap), `/?reminder=<id>&action=snooze|dismiss` (notification actions, in the hidden web view), `/?add=` (the quick-add widget), `/today` (the Today widget's header) and `/share?title=…&text=…&url=…[&files=1]` (shares; files follow as the `opentodo-files` message, the same one the browser extension posts, at most 10 files, 20 MB each, 25 MB in all).

## Testing

- JVM unit tests (`./gradlew :app:testDebugUnitTest`): address rules, the health check against a local socket, schedule parsing, the widget model, share mapping and limits.
- The web side's tests run with `npm test` in `web/` (`shell.test.ts`, `shellPublish.test.ts`, `shellActions.test.ts`, `shellNotifications.test.tsx`, `aboutShell.test.tsx`, `e2ee.test.ts`).
- Instrumented tests on an emulator (`app/src/androidTest`, `./gradlew :app:connectedDebugAndroidTest` with an emulator or a phone attached). CI's `android` job runs them on an API 34 Google APIs emulator with a cached AVD. A local stand-in server (MockWebServer, test-only) answers the health check and serves the pages:

  | Class | Covers |
  | --- | --- |
  | `SetupActivityTest` | the first-run screen: local http after the warning, public http refused with the https offer, an invalid address, a server that isn't OpenTodo, nothing listening, an untrusted certificate |
  | `BridgeTest` | `window.opentodoShell` on the server's origin and absent on another one, a call answered through the message channel, links to other sites in the system browser, back, the offline screen |
  | `ShareTest` | text, a lone link, two photos as the `opentodo-files` message, a share waiting for the first-run screen |
  | `ReminderTest` | an exact alarm firing, the inexact fallback, Snooze and Dismiss through the hidden run, a tap opening the task, re-arming after a reboot |
  | `WidgetTest` | the Today widget in a bound host: rows, counts and "+ n more", counts only while locked, no request of its own |
  | `BiometricTest` | without an enrolled finger: no `biometric` capability, nothing stored, the wrapped key forgotten; the prompt with an enrolled finger is skipped on the emulator and checked in the device smoke test |

  The tests allow exact alarms with `appops` and bind the widget with `appwidget grantbind`; turning exact alarms off in-process would stop the app, so the fallback is armed through `Scheduler.arm(…, exact = false)`.
### Device smoke test

Record each run here: date, device, Android version, server version.

| Step | Result |
| --- | --- |
| First run: enter the server, sign in | not run yet |
| Offline start after the first run | not run yet |
| Share a link, then two photos | not run yet |
| A reminder with the app closed | not run yet |
| Snooze from the notification | not run yet |
| Today widget after a change on another device (within the hour) | not run yet |
| Biometric unlock of an encrypted account | not run yet |
| Change server | not run yet |

## Release signing

Release builds are signed only in CI, on a `v*` tag, from four repository secrets: `ANDROID_KEYSTORE_BASE64` (the keystore file, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The job writes `keystore.properties` and the keystore to the runner's temporary directory, builds `opentodo-android-<version>.apk` and `.aab`, deletes both files, and the release job attaches the two files with build provenance. Without the secrets the tag build skips signing with a warning. Never commit a keystore or `keystore.properties` (both are ignored).

Store texts live in `android/store/`: `listing/<lang>.txt` (six languages), `data-safety.md` (the Play form: no data collected, no third-party SDK), `fdroid/app.opentodo.yml` (fdroiddata metadata) and `permissions.txt`.
