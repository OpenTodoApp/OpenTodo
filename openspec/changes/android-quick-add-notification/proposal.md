# Proposal

## Why

Capturing a task on Android today means finding the app or a home-screen widget. Issue [#2046](https://github.com/OpenTodoApp/OpenTodo/issues/2046) asks for what TickTick offers: an optional notification that stays in the shade, so a task can be added from inside any app, with natural-language dates and the Inbox by default, and the person returned to the app they were in.

## What Changes

- **A switch, off by default.** In the Android app, Settings → Capture → Quick add gets a **Quick add notification** card with one switch, **On this phone**. It is a setting of the phone, stored by the shell and not synced.
- **An ongoing, silent notification** on its own channel ("Quick add", minimum importance, no badge, no sound). Tapping its body opens the app's quick add (the `/?add=` address the widgets open). Its **Add task** button takes the title right in the notification (inline reply). The web app saves it in a background run as an ordinary task operation, parsed the way quick add parses it (dates, `#project`, priority, existing labels). It goes to the Inbox unless a project is typed, and the person stays in the app they were in.
- **For an end-to-end encrypted account** the button opens quick add instead of taking text, because the background run has no key to write to the account.
- The notification comes back after a reboot, after an app update and at the next start of the app. It goes when the switch is turned off, on sign-out and on **Change server**.
- On Android 13 and later, turning it on asks for the notification permission when the app does not have it. A refusal leaves the switch off and the card says so.
- **Bridge:** a new visible-only capability, `quick-add-notification`, with one method, `quickAddNotification(json)`.

Not **BREAKING**. No op, field, route or environment variable is added; bridge version 1 gains one capability. No new Android permission: POST_NOTIFICATIONS and RECEIVE_BOOT_COMPLETED are already declared.

## Out of scope

- A Quick Settings tile (the issue's "welcome addition"). A later change can reuse the same address and background add.
- The iPhone app, which has no persistent notifications; its widgets and Shortcuts cover capture there.
- Buttons in the notification for a project, date or labels. The typed text carries them.
- Re-posting the notification when the user swipes it away on Android 14 and later, where ongoing notifications can be dismissed. It returns at the next app start or reboot.

ROADMAP item advanced: "Native shells" (the Android app's capture surfaces).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a persistent quick-add notification in the Android shell.

## Impact

- `mobile/android`:
  - `QuickAddNotification.kt` (the channel, the notification and the inline reply receiver);
  - `Bridge.kt`, `Prefs.kt`, `Reminders.kt` (boot) and `MainActivity.kt` (start);
  - the manifest (one receiver).

  No new string resource: the channel, title and button reuse the widget's translated strings.
- `web/src`: `lib/shell.ts`, `lib/shellQuickAdd.ts`, `lib/shellActions.ts`, `lib/shellBackground.ts`, `lib/shellPublish.ts`, `app/QuickAddSettings.tsx`, `lib/settingsCopy.ts` and the catalogs.
- Shared fixtures: `bridge/capabilities.json` and a new `bridge/quick-add-notification.json`.
- Docs: `docs/android-app.md`.
