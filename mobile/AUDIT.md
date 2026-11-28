# Mobile audit: why the apps feel like a website, and the plan

2026-11-13. The Android and iOS apps are shells around the web app. The owner decided to keep that and make the shells feel native; the React Native app that was tried in `mobile/app` was removed on 2026-11-21.

The audit read both shells and the web app on a phone. Paths are from the repository root.

## Findings

### Reminders (the complaint)

`shell-reminders-on` turns reminders and task names on by default, asks for exact alarms with an explanation and ends a hidden run on a signal. `shell-push` brings push to the Android app through UnifiedPush. Push to the iPhone and the limits of iOS remain.

Both shells only fire reminders the web app handed them while it ran.

| Finding | Where |
| --- | --- |
| **Off by default.** The device switch defaults to off and sits in Settings → Notifications. A fresh install never fires a reminder and never asks for the permission. | `web/src/lib/shellPublish.ts:76` |
| The hand-over covers 7 days, and happens only while a page runs. | `web/src/lib/shellPublish.ts:23,113` |
| With the app closed, a hidden run loads the whole web app about hourly: a fixed 30 s on Android with no completion signal; on iOS only when the system allows it, never after a force quit. A reminder created on another device arrives after the next successful run, or not before it is due. | `mobile/android/.../HiddenRun.kt`, `mobile/ios/OpenTodo/BackgroundRefresh.swift` |
| No push reaches a shell. The server sends web push (VAPID) and ntfy, Pushover, Gotify; a web view has no push manager. Android: fixed by `shell-push` (UnifiedPush). iPhone: see Open. | `internal/push`, `internal/channels` |
| Android 14+: exact alarms are denied by default; the shell asks once, with no explanation. | `mobile/android/.../Bridge.kt:104` |
| iOS: at most 64 pending notifications; Done, Snooze and Dismiss open the app (a local notification cannot change a task by itself). | `mobile/ios/OpenTodo/Reminders.swift:38`, `AppModel.swift:83` |
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
| ~~The iOS store build has no service worker, so it cannot start offline.~~ Fixed (#1458): when the server is unreachable at launch the shell opens the app from the web view's cache. WKWebView cannot intercept the real origin's requests the way Android's `ShellCache` does, so this uses the web view's own HTTP cache (`.returnCacheDataDontLoad`); a cold cache still needs the network once. | `ShellView.swift`, `ShellCache.kt` |
| The loading skeleton does not show the phone's tab bar and header. | `web/src/app/App.tsx:191` |

### Web giveaways

Fixed by `shell-touch`, `pull-to-sync`, `page-transitions`, `edge-swipe-menu`, `edge-swipe-back`, `sheet-drag-dismiss`, `no-double-tap-zoom`, `disable-touch-zoom` and `phone-row-titles`, apart from back-to-close on WebKit and windowed lists; each still needs its check on a phone.

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

Nothing to delete in the shells: every class is wired. Small leftovers: the `share` capability is advertised and never read (the native-shells spec uses it as an example); the bridge types name the `desktop` platform of the planned desktop shell; `geofences` and `requestMicrophone` are Android-only. Both shells check their capability lists against one shared fixture (`shellBridge.fixture.test.ts`).

## Plan

Each step is one OpenSpec change, ships on its own, and ends with a check on a real phone.

Done: `shell-repairs`, `shell-reminders-on`.

Second round (2026-11-14, from the interface tour at 360 px and what was left above): `touch-keyboard-hints`, `shell-touch`, `phone-row-titles`, `phone-header-room`, `sheet-drag-dismiss`, `pull-to-sync`, `shell-first-paint`. Issues #1337 to #1343.

Third round (2026-11-14, what the second found and left): `touch-pressed-states`, `phone-bar-overflow`, `phone-titles-everywhere`. Issues #1349 to #1351. Then `shell-push` (#1344), Android through UnifiedPush.

Fourth round (2026-11-14, a new tour at 360 px): `phone-row-controls`, `touch-sheet-focus`, `phone-calendar-chrome`, `touch-no-tooltips`. Issues #1359 to #1362.

Fifth round (2026-11-14, the tour after the fourth: 43 findings, from over 186): `phone-fab-clearance`, `phone-icon-picker`, `phone-task-page-targets`, `phone-stats-period`, `phone-timeline-rows`. Issues #1368 to #1372.

Sixth round (2026-11-14, the first tour at 768 px with touch, a tablet held upright): `tablet-header-room`, `touch-sidebar-names`, `reminder-card-compact`, `phone-fab-scroll-room`, `today-no-shift`. Issues #1379 to #1383.

Since (2026-11-15 to 22, under the open umbrella change `mobile-native-feel` and after it): `press-feedback-delay`, `touch-input-mode`, `row-lift-overscroll`, `swipe-back-follows`, `status-bar-scroll-top`, `app-links`, `ios-keyboard-bar`, `tablet-layouts`.

Seventh round (2026-11-25): **a phone UI of its own**, `phone-ui-trial`. After six rounds the apps still read as "a responsive version". Looking at the screens showed why polish had run out: Today and the task page already had a large title, two-line rows, 44 px fact rows and editors as bottom sheets. What was left of the desktop was the design itself: a grip on every row, a bar of buttons in a group's header, an add field and an add button on one screen, facts behind "More properties". So the owner decided to try screens designed only for a phone, in their own part of the web app (`web/src/phone/`), running on the hooks the desktop screens run on. This is how TREK (`liketrek/TREK`), a web app in web-view apps like ours, is built.

- **The trial:** Today, the task page and a date sheet, behind **New phone screens** in Settings, off by default and kept on the device. The design was drawn in Storybook first and approved against screenshots of the present screens.
- **The destination, if it passes:** the phone UI is what both apps and a phone browser show below 768 px, with every function of the web app in it, screen by screen; a screen without a phone view keeps its present layout meanwhile. A tablet later shows two phone screens side by side, so the screens are written as panes.
- **The gate:** both screens on real phones, switch on and off, in front of the people who gave the feedback. Verdict: *the reviewers' is not yet recorded*. The owner tried both screens on an iPhone (Chrome, iOS 27) on 2026-11-25, found them good and decided to go on to the whole phone UI before that verdict: every function of the web app in it, starting with every task list (`phone-lists`).
- **If it fails:** the web view is the limit, and the native app (`native-app-foundation`) is the remaining way; the screen designs carry over.

After the trial (2026-11-25): the phone UI grew to the whole app in three steps, `phone-lists` (every task list, at parity), `phone-all-screens` (the phone header and the phone task row on every screen) and `phone-ui-default` (on by default below 768 px, the switch kept as the way back on a device). On 2026-11-27 the owner decided the way back is no longer needed: `phone-ui-only` removes the switch, so the phone UI is the only thing a screen narrower than 768 px shows. Checked by the unit tests, the layout and accessibility check over the whole inventory with the phone screens, the visual baselines, an end-to-end check of the gestures, the time benchmark's phone profile, and in the Android app on an emulator (API 34). Still to do on real devices: Safari and the iPhone app, an Android phone, and system Back over a sheet, which the emulator cannot show.

Open:

- **Push to the iPhone app**: an iPhone only takes pushes signed with the app's key, so a self-hosted server needs a relay the project would run, or an app signed by whoever runs the server. Not planned. Android has it through `shell-push` ([#1344](https://github.com/OpenTodoApp/OpenTodo/issues/1344)).
- The iOS store build opens offline from the web view's cache after one successful load (#1458); a first-ever launch with nothing cached still needs the network.
- Still open after the third round: display options are a button in the phone bar, so a very long project name is cut at about 24 characters; windowed lists; universal links; lock-screen widgets.
- The iOS share extension still opens the app through the responder chain (`ShareViewController.swift:90`).
- Back-to-close for overlays stays off on WebKit (`web/src/ui/overlay/useBackToClose.ts:20`).
- Proposed, not on main: `tablet-shells` (hardware keyboards, window resizing) and `focus-live-activity`.

A modern look (2026-11-27, `phone-modern-look`): the owner asked for the phone UI to look like a modern phone app, not only to work like one. The tab bar floats with the add button beside it, Today opens with tiles for done, up next and late, Upcoming with the week ahead, and the lists have a light behind their titles and rounder cards. Checked by the full CI run (every layout leg in Chromium and WebKit, French, German, safe area, end-to-end, accessibility, visual).

Owner sign-off (2026-11-28): after testing the phone UI on a phone, the owner approved it ("Tutto bene, la approvo") and asked for 1.11.0 to be released with it. The device and system were not stated, so the device check below is not recorded as done for a named phone.

## Device check, after each step

Fresh install, then: a reminder set on another device fires with the app closed, after a force quit and after a reboot; Done from the notification completes the task; a download saves; Back and the back swipe go back; cold start shows no blank screen, online and offline.

Native feel (`mobile-native-feel`), on an iPhone and an Android phone:

- A scroll that starts on a row does not flash it; a pressed circle dims alone (`press-feedback-delay`).
- After taps, no row keeps a hover look and no control a focus ring; with VoiceOver and with TalkBack the focused control still shows its ring; an iPad keyboard's Tab shows it again (`touch-input-mode`).
- A held task row and a held sidebar row rise before the menu or the drag, and settle when lifted early; with reduced motion only the tint shows; no glow or stretch at a list's end in the Android app (`row-lift-overscroll`).
