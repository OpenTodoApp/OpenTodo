# Design

## Context

Both shells load the web app from the user's server and talk to it through bridge version 1 (`web/src/lib/shell.ts`; Android `Bridge.kt`, iOS `Bridge.swift`). Capabilities are optional and additive, and the payloads are pinned by shared fixtures (`web/src/lib/shellBridge.fixture.test.ts`, `BridgeFixtureTest.kt`, `ShellDataTests.swift`).

What the code does today:

- **Saving.** The web app saves in two ways: eight places build a `Blob`, an object URL and a detached `<a download>` they click (`TwoFactorPanel`, `EncryptionPanel`, `review/timeExport`, `ServerArchivePanel`, `lib/templates`, `lib/theme/template`, `lib/theme/files`, `lib/attachmentOpen`); three link to the server (`DataSettings` exports, attachment content, the public task page). Neither shell handles a download: Android has no `DownloadListener`, iOS no download policy.
- **Back.** `MainActivity` disables its `OnBackPressedCallback` to let the system leave the app, and never enables it again. Since Android 12 Back on a launcher activity moves the task to the background instead of finishing it, so the activity lives on with the callback off.
- **Haptics.** `motion.ts` `tick()` calls `navigator.vibrate(10)`. Android's web view needs the `VIBRATE` permission for it, which the app does not hold; WebKit has no vibrate.
- **Done.** `shellActions.ts` accepts `action=done`; Android offers it, iOS registers only Snooze and Dismiss, and `AppModel.show(reminder:action:)` drops other actions.
- **Status bar.** iOS parses `lightIcons` and never applies it.

## Goals / Non-Goals

**Goals:** each broken item works, with no new permission, no new dependency, and bridge version 1 kept.

**Non-Goals:** reminders on by default, push, startup, touch and motion (later changes); opening attachments inline; a downloads list or progress UI.

## Decisions

### D1. One web helper for every save

`web/src/lib/saveFile.ts`: `saveFile(blob, name)` replaces the eight hand-built anchors. In a shell that lists `files` it hands the bytes to the bridge; otherwise it clicks an anchor as today. One place to test, and the next save added to the app works in the shells without thought.

Alternative: catch downloads natively by patching anchor clicks from the injected script. Rejected: a detached anchor's click never reaches a document listener, so it would mean patching `HTMLAnchorElement.prototype`, invisible to the web app's tests.

### D2. Android: bytes over the bridge, then the system's save dialog

- **Files made in the page** (`files` capability): `saveFile(json)` with `{id, name, type, data, last}`, base64 in chunks of 256 KB, appended to a file in the app's cache directory. On `last` the shell opens `ACTION_CREATE_DOCUMENT` with the name and type, copies the cache file to the chosen document and deletes it. The method answers `saved`, `cancelled` or `failed`. A new `id` discards an unfinished one; the cache file is also deleted at start. Names are reduced to their last path segment.
- **Files from the server**: a `DownloadListener`. For an address on the configured server's origin the shell fetches it itself with the web view's cookies and user agent (`HttpURLConnection`, streamed to the same cache file, no redirects off the origin), then the same save dialog. Any other address is handled as a foreign link is today.

`ACTION_CREATE_DOCUMENT` needs no permission on any supported version (minSdk 26), and the user sees where the file goes. Alternative: `DownloadManager` into the public Downloads folder. Rejected: it needs the storage permission below Android 10 and cannot take page-made bytes.

### D3. iOS: WebKit's own downloads

iOS 16.4 is the minimum, and `WKDownload` handles both object URLs and server responses, with the anchor's `download` name. The shell answers `.download` for a navigation action that `shouldPerformDownload` and for a response that is an attachment or cannot be shown, only on the server's origin (and `blob:` of it). The file goes to a temporary directory, then `UIDocumentPickerViewController(forExporting:asCopy:)`; the temporary file is removed when the picker ends. iOS does not list `files`: `saveFile` falls back to the anchor, which WebKit turns into a download.

### D4. Back on Android

The callback stays enabled. On the first screen it calls `moveTaskToBack(true)` itself, which is what the system does for a launcher activity. Predictive back is not opted into here (`shell-motion`).

### D5. Haptics

Bridge method `haptic(kind)`, capability `haptics`, kinds `tick` and `success`.

- Android: `View.performHapticFeedback` on the web view (`CONTEXT_CLICK` for `tick`; `CONFIRM` for `success` on API 30+, else `CONTEXT_CLICK`). No permission, and it follows the system's touch-feedback setting.
- iOS: `UIImpactFeedbackGenerator(.light)` for `tick`, `UINotificationFeedbackGenerator` `.success` for `success`.
- Web: `motion.ts` gains `success()` next to `tick()`; both go through one function that picks the bridge or `navigator.vibrate(10)`. `canVibrate()` is true when either exists, so the Appearance switch appears on iPhone.
- A background run (no screen) does not list `haptics`.

### D6. Done on iOS

A third `UNNotificationAction` `done`, `.foreground` like the other two (ios-shell D3: a local notification cannot change a task by itself), and `AppModel` passes `done` through. The address `/?reminder=<id>&action=done` is already in the shared fixtures for Android.

### D7. iOS status bar icons

`preferredColorScheme` and `overrideUserInterfaceStyle` are ruled out: both change `prefers-color-scheme` inside the web view, and a theme that follows the system would flip and hand back another colour. The icons are set through `preferredStatusBarStyle` instead: the app's window gets a `UIHostingController` subclass as root (installed by a scene delegate through `UIApplicationDelegateAdaptor`) whose style reads the stored choice and calls `setNeedsStatusBarAppearanceUpdate()` when the bridge hands a new one. The choice is stored with the colour and applied at launch.

### D8. Face ID text

`NSFaceIDUsageDescription` in `project.yml`'s Info.plist properties and in `InfoPlist.xcstrings` for the shipped languages. A unit test reads the built bundle's key.

### Data model, size

No op field, no table, no server route. Android gains no dependency; the APK grows by a few KB of code. The web app's first load gains `saveFile.ts` (under 1 KB gzip), inside the budget.

### Interface budget

No screen gains chrome, properties, destinations or scroll regions; the Appearance haptics switch already exists and only appears on more devices. No new shortcut.

## Risks / Trade-offs

- **Cannot be verified here.** Downloads, haptics, the status bar and Done need a phone. Unit tests cover the parsing, the origin check, the chunk assembly and the fixtures; the tasks end with a device checklist for the owner.
- **Large files over the Android bridge** cost base64 time (a 100 MB server archive is about 530 messages). Acceptable for a rare action; the fetch path covers the common large case (exports).
- **D7 replaces the root controller**, which touches app start. The iOS UI walkthrough in CI catches a blank launch.
- **Old server, new Android app**: page-made files still do not save until the server is updated. Stated in the docs.
