# Proposal

## Why

The audit of the phone apps (`mobile/AUDIT.md`) found things that are simply broken in the web-view shells. Each one tells a person "this is a website in a box":

- **Saving a file does nothing.** The recovery key, the two-factor recovery codes, exports and attachments all fail silently in both apps. For the recovery key that is a way to lose an account.
- **Back leaves the Android app.** After the first time Back exits the app, it exits every time, even from a task or a dialog.
- **No haptics.** The web app's vibration call does nothing in either shell.
- **Face ID unlock fails** on iPhone: the app does not carry the text iOS requires.
- **The iPhone notification has no Done button**, though the Android one does and the web app accepts it.
- **iPhone status bar icons ignore the app's theme**: a dark theme under a light system leaves dark icons on a dark bar.

These need no design debate. Fixing them first is the largest gain for the least risk, and the later steps of the plan build on a shell that works.

## What Changes

- **Saving files.** A file the web app saves, from its own data or from the user's server, opens the phone's save dialog with the file's name, in both shells.
- **Android Back** keeps going back inside the app, however often the app was left and resumed.
- **Haptics through the bridge.** A new optional bridge method gives a short tick or a success tap with the platform's own feedback. In a browser the web app keeps today's vibration.
- **Face ID.** The iOS app carries its usage text, in every language the app ships.
- **Done on iPhone.** The reminder notification offers Done, next to Snooze and Dismiss.
- **iPhone status bar icons** follow the bar colour the web app hands over.

Out of scope: turning reminders on at first run (`shell-reminders-on`), push (`shell-push`), startup, touch and motion polish (the later steps of `mobile/AUDIT.md`), opening an attachment inline, and the iOS share extension's way of opening the app. JavaScript `alert` and `confirm` in the iOS shell were in the audit and are dropped: the web app never calls them.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: saving files, Back on Android, haptic feedback and Done from a notification become requirements; the iOS status bar icons must follow the handed-over bar colour.

## Impact

- `mobile/android`: the download path, the Back callback, two bridge methods (`saveFile`, `haptic`) and their capabilities. No new permission, no new dependency.
- `mobile/ios`: download handling, the Face ID text, the Done action, the status bar style, the `haptic` bridge method.
- `web/src/lib`: one helper every file save goes through, haptics through the bridge, the bridge fixtures.
- No server change, no op field, no new environment variable. The web app's first-load budget is unaffected beyond a few hundred bytes.
- Compatibility: bridge version stays 1. An older shell lacks the new capabilities and behaves as today; a newer shell on an older server saves files from the server but not files made in the page (Android).
