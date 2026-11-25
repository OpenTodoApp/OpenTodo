# Design

## Context

The Android shell already has every piece this needs:
- The quick-add widget opens `opentodo-open:/?add=` (native-shells "Widgets").
- Reminder and widget actions run the web app in a hidden web view, which applies them as ops and reports `backgroundDone()` (shell-reminders-on D4, android-widget-list D2).
- Shell-only settings are offered by the web app only when the shell lists a capability (location reminders, push).

This change combines them.

## Goals / Non-Goals

**Goals:**
- Capture from the notification shade in any app, with quick-add parsing, without leaving that app.
- Opt-in, per phone.
- Nothing changes for browsers, the iPhone app or people who never turn it on.

**Non-Goals:** a Quick Settings tile, project or date pickers in the notification, iOS.

## Decisions

**D1. The shell owns the switch.**
The notification belongs to the phone. It has to come back after a reboot without the web app, and it has to go with the server's data on Change server. So the state lives in the shell's private preferences (`Prefs.quickAddNotification`), which `clearServerData` already wipes. The web app reads and writes it through the bridge.

Alternative: a web-side meta row handed over like the reminders switch. The shell would still need its own copy for the boot, and two copies could disagree.

**D2. One method, `quickAddNotification(json)`.**
The argument is `{"on"?: boolean, "reply": boolean}`, and the answer is `"on"`, `"off"` or `"denied"`:
- `on: true` shows the notification when notifications are allowed. Without the permission, the visible app asks on Android 13 and later; a refusal answers `denied` and the switch stays off.
- `on: false` removes the notification.
- Without `on`, the shell only takes the new `reply` and answers the state. Settings reads it this way.

The capability is visible only: a background run never asks for anything.

**D3. Inline reply only when the background run can write.**
`reply` is false for an encrypted account. The background run has no key, so it can neither read nor write the account, for the same reason that Done opens the unlock screen on a locked account. Without `reply`, the button opens quick add, as the body does.

The web app sends `reply` with every call. The shell publishers send it again when encryption is turned on or off, skipping a value already sent. The shell re-posts the notification only when the value changed.

**D4. The reply is the widget's address, applied in a background run.**
- The receiver enqueues a hidden run at `/?add=<text>`, at most 500 characters (the address's own limit).
- In a background run, and only there, the web app saves a non-empty `add` instead of prefilling it:
  - It reads the line with quick-add syntax (`noteTasks.lineInputs`: dates and times, `#project`, priority and existing labels).
  - It places the task by the user's add position.
  - It creates the task with `createTask`, so the default is the current workspace's Inbox and the op log carries the task. Offline, the task is stored and synced later.
- The visible app keeps prefilling without saving, so another app that opens OpenTodo at that address still saves nothing (native-shells "Widgets").
- The run waits for the add as it waits for a reminder action (`reminderActionsApplied`).
- After the reply, the shell re-posts the notification, which ends the inline field's progress state.

**D5. The notification.**
- **Channel:** `quick-add` at `IMPORTANCE_MIN`, with no badge and no sound, named "Quick add" like the widget.
- **Notification:** ongoing, silent, `PRIORITY_MIN`, with no timestamp and a fixed id. It carries no task content.
- **Content:** the title is "Quick add" and a tap on the body opens `/?add=`. The one action is "Add task", with a `RemoteInput` whose hint is "Add task".
- **Strings:** it reuses the translated widget strings and adds no string resource.
- **Reply intent:** the PendingIntent is mutable, as RemoteInput requires, and explicit, to a receiver that is not exported.

**D6. Coming back and going away.**
- **Coming back:** when the switch is on and notifications are allowed, the shell posts the notification again:
  - from `BootReceiver` after a boot;
  - from `BootReceiver` after the package is replaced, since an update removes an app's notifications;
  - from `MainActivity` at start.
- **Going away:**
  - on `on: false`;
  - on the web app's sign-out (`forgetShellData` sends `on: false`);
  - on Change server (`cancelAll` and `clearServerData`).

## Data model

None: no op, no field, no route. The text becomes a task through `createTask`, an existing op path.

## Interface budget

One card on an existing settings page, shown only in an Android app that lists the capability. It holds one switch and, after a refusal, one notice. It adds no chrome to any list and no shortcut.

## Size

No dependency. The web part adds a few hundred bytes to the settings chunk plus a background path loaded on demand. The APK gains one small class.

## Risks

- Android 14 and later let the user swipe an ongoing notification away. It returns at the next app start or reboot; fighting the swipe is out of scope.
- Some launchers fold minimum-importance notifications into a "silent" group. The user can raise the channel's importance in Android's settings.
