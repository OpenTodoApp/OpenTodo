# Proposal

## Why

#2183: Done on a repeating task's notification could leave the due occurrence open. A notification's Done opens the app at `/?reminder=<id>&action=done` (the Android app in a hidden web view, iOS and web push in a window), and the app applied it at once from what the device last synced. A device behind the server holds the series at an occurrence already completed elsewhere: completing that copy rewrote the done record, moved the series back with a newer clock and re-armed its reminder.

## What Changes

- **Done from a notification waits for the first sync** of the page it opened, up to 30 seconds (10 when sync never starts); offline, or when sync cannot run, it applies at once from what the device has. Snooze and Dismiss do not wait.
- **Done on an occurrence already completed elsewhere writes nothing.** For a relative or deadline reminder of a repeating task, the device computes the firing from the task's current due or deadline; when that and the stored firing are both more than an hour from now, the series has moved on and Done leaves it alone. A snooze set on another device, a server clock ahead or a firing written in another time zone does not stop it.

Not **BREAKING**. No op field, route, bridge method or environment variable. Convergence is unchanged: Done is the app's own completion, as ordinary operations.

## Out of scope

- Absolute and location reminders of a repeating task: they carry no occurrence, so a stale notification's Done still moves the series. A follow-up has the shell pass the occurrence it showed (`&on=<YYYY-MM-DD>`), as the widget's completion does.
- The Android shell's run (`HiddenRunWorker` not using the result of its wait, the notification cancelled before the action is stored).

ROADMAP item advanced: "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: "Done from a reminder notification" waits for the first sync and leaves an occurrence completed elsewhere alone (MODIFIED).

## Impact

- **Web:** `web/src/lib/shellActions.ts` (`afterFirstSync`, the guard in `applyReminderAction`). No new string, a few hundred bytes.
- **Server, Android, iOS, data model:** none.
