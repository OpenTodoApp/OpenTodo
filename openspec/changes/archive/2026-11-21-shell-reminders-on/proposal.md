# Proposal

## Why

"Reminders only work while the app is open" is the complaint that started the work on the phone apps (`mobile/AUDIT.md`). The apps can already show a reminder as a system notification with the app closed. Almost nobody gets one, for reasons that are not the missing push:

- **Off until found.** Notifications through the app are off on a fresh install. The switch is in Settings → Notifications, and nothing in the app points to it. Until then the app hands the phone an empty schedule and never asks for the permission.
- **"Task reminder."** With the switch on, the notification still does not say which task, unless a second switch is found.
- **Late on Android.** Since Android 14 exact alarms are refused for a new install. The app asks once by jumping into a system settings page with no explanation; a person who backs out gets reminders minutes late, for good.
- **Background runs are cut off.** With the app closed, the phone refreshes the schedule by running the web app hidden for a fixed 30 seconds. A slow sync is cut off before the schedule is handed over, and a fast one keeps the phone awake for nothing.

Push (`shell-push`) is the next step and the larger one. This change makes what exists work for everyone first, and push will build on it.

## What Changes

- **On by default in the apps.** In a shell, reminders go to the phone unless the user turned them off. The system's permission question comes with the first reminder the phone could show, in the visible app, never at launch and never from a background run. Answering no turns the setting off, with the explanation Settings already has.
- **Task titles by default** in the apps, for an account the server can read. An encrypted account keeps the generic text, as today. The switch stays.
- **Exact alarms are asked for, not jumped to.** When Android refuses exact alarms, the app says once that reminders can be a few minutes late, with a button that opens the system page. Settings keeps the same notice and button.
- **A background run ends when it is done.** The web app tells the shell when it has synced and handed over the schedule; the shell stops then, or after a longer limit when nothing is heard.
- **The right words on iPhone.** Settings no longer names Android's settings on an iPhone.

Out of scope: push to a closed app (`shell-push`); reminders further out than seven days; the 64 pending notifications of iOS; a reminder set on another device that falls due before the next background run (it needs push).

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: Notification settings: in a shell the setting is on unless turned off, and titles are included unless turned off.
- `native-shells`: when the notification permission is asked, exact alarms on Android, and the end of a background run.

## Impact

- `web/src/lib/shellPublish.ts` and `shell.ts` (defaults, the visible-app rule, two bridge methods), `web/src/app/ShellNotifications.tsx` (the notice and button, platform wording), a one-time notice in the app.
- `mobile/android`: `Bridge.kt` (no jump on schedule; `openAlarmSettings`), `HiddenRun.kt` (the completion signal). `mobile/ios`: `BackgroundRefresh.swift` (the completion signal).
- Bridge version stays 1; capabilities `alarm-settings` and `background` are additive. An older shell keeps its 30 seconds and its jump; an older web app in a newer shell keeps today's defaults.
- No server change, no op field, no new permission, no new dependency, no new environment variable.
- Existing installs: a device where the user never touched the switch starts receiving reminders after the update, with the permission question at the first reminder. A device where it was turned off stays off.
