# Proposal

## Why

GitHub issue [#2062](https://github.com/OpenTodoApp/OpenTodo/issues/2062): a reminder notification should say when the task is due, the way other task apps do ("Heute 10:50" under the title). Today the browser's notification says "Due Nov 3, 15:00" only when the task is already on the device, and falls back to "Reminder" otherwise. The Android and iPhone apps always say "Reminder" or nothing. The in-app notification of a hidden tab says "Reminder".

## What Changes

- A reminder notification's body is the task's due in the words a task row uses, as of the day the reminder fires: "Today 14:00", "Tomorrow", "Friday 09:00", or a short date ("28 Nov") further out or in the past. It uses the user's language and date and time formats. No "Due" prefix. A habit's tiny version still takes the body ("One page is enough"). A task without a due date keeps the generic text.
- Web push: the service worker writes these words from the task on the device. When the device opted in to task titles, the payload also carries the task's due, so the body is complete before the device has synced the task.
- The Android and iPhone apps: the web app hands each scheduled reminder's due text to the shell with its title, and the shell shows it as the notification's body. A reminder that arrives by UnifiedPush uses the due text of the same reminder in the phone's schedule.
- The in-app system notification of a hidden tab uses the same body.

No new mandatory environment variable, no op change, no new route. The push payload and the bridge's `scheduleReminders` entry each gain one optional field, and older clients ignore it.

## Out of scope

- High-priority reminders marked as important or time-sensitive (the issue's second idea). On iOS this needs the Time Sensitive Notifications entitlement, which is a new capability for the app. Web Push has no such level. Android already posts reminders on a high-importance channel. Recorded as a follow-up.
- Notification channels (ntfy, Pushover, Gotify, webhooks): their text is built on the server in the channel's language, and the server has no date formatter for the user's language and formats. Recorded as a follow-up.
- Location reminders, which have no firing time.

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `reminders`: the notification body names the due in a task row's words. The opt-in payload carries the due.
- `native-shells`: the scheduled reminder carries its due text, which the shells show as the body.
