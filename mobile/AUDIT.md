# Mobile audit: why the apps feel like a website, and the plan

2026-11-13. The Android and iOS apps are shells around the web app. The owner decided to keep that and make the shells feel native; the React Native app (`mobile/app`, `native-app-*`) is paused, its code kept.

The audit read both shells and the web app on a phone. Paths are from the repository root.

## Findings

### Reminders (the complaint)

`shell-reminders-on` turns reminders and task names on by default, asks for exact alarms with an explanation and ends a hidden run on a signal. Push and the limits of iOS remain.

Both shells only fire reminders the web app handed them while it ran.

| Finding | Where |
| --- | --- |
| **Off by default.** The device switch defaults to off and sits in Settings → Notifications. A fresh install never fires a reminder and never asks for the permission. | `web/src/lib/shellPublish.ts:76` |
| The hand-over covers 7 days, and happens only while a page runs. | `web/src/lib/shellPublish.ts:23,113` |
| With the app closed, a hidden run loads the whole web app about hourly: a fixed 30 s on Android with no completion signal; on iOS only when the system allows it, never after a force quit. A reminder created on another device arrives after the next successful run, or not before it is due. | `mobile/android/.../HiddenRun.kt`, `mobile/ios/OpenTodo/BackgroundRefresh.swift` |
| No push reaches a shell. The server sends web push (VAPID) and ntfy, Pushover, Gotify; a web view has no push manager. | `internal/push`, `internal/channels` |
| Android 14+: exact alarms are denied by default; the shell asks once, with no explanation. | `mobile/android/.../Bridge.kt:104` |
| iOS: at most 64 pending notifications; no Done action (the web app accepts it); Snooze and Dismiss open the app. | `mobile/ios/OpenTodo/Reminders.swift:38`, `AppModel.swift:83` |
| Notification text is the generic "Task reminder" unless the user opts in to titles. | `Reminders.kt:115`, `Reminders.swift:74` |

### Broken

Fixed by `shell-repairs`, apart from the share extension; each still needs its check on a phone.

| Finding | Where |
| --- | --- |
| **Downloads do nothing** in both shells: recovery key, two-factor codes, exports, attachments. | no `setDownloadListener`, no `WKDownloadDelegate` |
| **iOS Face ID unlock** has no `NSFaceIDUsageDescription`. | `mobile/ios/OpenTodo/Info.plist` |
| **Android Back** exits the app after the first exit and resume: the callback is disabled and never re-enabled. | `MainActivity.kt:134` |
| **Haptics**: `navigator.vibrate` only. Android has no `VIBRATE` permission; iOS has no vibrate. | `web/src/app/motion.ts:314` |
| iOS status bar icons ignore the app theme (`lightIcons` parsed, never applied). | `mobile/ios/OpenTodo/Bridge.swift:14` |
| iOS share extension opens the app through a responder-chain `openURL:`, fragile on iOS 18. | `OpenTodoShare/ShareViewController.swift:90` |

### Startup and offline

The splash and the skeleton are fixed by `shell-first-paint`; each still needs its check on a phone. The stored copy for the iOS store build is open.

| Finding | Where |
| --- | --- |
| No splash on either platform: a blank screen until the page paints; a slow server shows nothing. | `themes.xml`, `Info.plist:65` |
| The iOS store build has no service worker, so it cannot start offline and fetches on every cold start. Android serves a stored copy offline. | `AppBoundDomains.swift`, `ShellCache.kt` |
| The loading skeleton does not show the phone's tab bar and header. | `web/src/app/App.tsx:191` |

### Web giveaways

| Finding | Where |
| --- | --- |
| No `-webkit-tap-highlight-color`, no `-webkit-touch-callout`, no `overscroll-behavior` on the page; `user-select: none` only on task rows; pinch and double-tap zoom on. | `web/src/index.css` |
| iOS link previews and bounce are on; pull to refresh reloads the whole app. Android has no pull to refresh. | `ShellView.swift:53` |
| No transitions between screens, no edge swipe for the drawer, no drag to dismiss on dialog sheets. | `web/src/app/router.ts:462`, `web/src/ui/overlay/Dialog.tsx` |
| Back-to-close for overlays is off on WebKit. | `web/src/ui/overlay/useBackToClose.ts:20` |
| List text is 13 px on phones. | `web/src/index.css:118` |
| Lists are not windowed; every row stays in the DOM. | `web/src/app/task-list/rowBlocks.ts` |

### Already good

Bottom tab bar, row swipes, sheets on phones, safe areas, 16 px fields, 44 px targets, Android Back closing overlays, share in, widgets, biometric unlock on Android, notification actions on Android, reboot re-arming, local-first offline data.

### Dead or unused

Nothing to delete in the shells: every class is wired. Small leftovers: the `share` capability is advertised and never read; the bridge types name a `desktop` platform that does not exist; `geofences` and `requestMicrophone` are Android-only.

## Plan

Each step is one OpenSpec change, ships on its own, and ends with a check on a real phone.

Done: `shell-repairs`, `shell-reminders-on`.

Second round (2026-11-14, from the interface tour at 360 px and what was left above): `touch-keyboard-hints`, `shell-touch`, `phone-row-titles`, `phone-header-room`, `sheet-drag-dismiss`, `pull-to-sync`, `shell-first-paint`. Issues #1337 to #1343.

Open:

- **`shell-push`** ([#1344](https://github.com/OpenTodoApp/OpenTodo/issues/1344)): the server wakes the app when a reminder changes. Android through UnifiedPush; iOS needs a relay that holds the app's key, or an app signed by whoever runs the server. A decision for the owner before any design.
- The iOS store build cannot start offline (no service worker without app-bound domains).
- Found in the second round, not done: a pressed colour per component (one generic dim covers touch today); the tab bar measures 45 px on touch where its spec says 48; a long project name is still cut at 360 px (Filter could move into the project menu); one-line titles remain in calendar compact rows, Close the day, command bar results and Notes; windowed lists; universal links; lock-screen widgets.

## Device check, after each step

Fresh install, then: a reminder set on another device fires with the app closed, after a force quit and after a reboot; Done from the notification completes the task; a download saves; Back and the back swipe go back; cold start shows no blank screen, online and offline.
