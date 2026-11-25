# Design

## D1. The row's words, as of the day it fires
The body is `describeDue(due, day).label` from `web/src/lib/dates.ts`, the label a task row shows: "Today", "Tomorrow" or the weekday within a week, else the compact date (a past date as well), followed by the time when the due has one. `day` is the logical day of the reminder's firing time (`logicalDay(fire_at)`), not the day the text is built. The shells receive the text up to a week ahead, and it has to be right when the notification shows. One function, `notificationDue(due, fireAt)`, builds it for the shells and the hidden-tab notification.

The "Due" prefix goes. The words sit under the task's title, and on a lock screen the short form is what the issue asks for. A habit's tiny version keeps priority (habits "Reminder text"). Without a due date the body stays the generic text.

## D2. The service worker's copy
`public/push-sw.js` runs outside the bundle and keeps inline copies of the date and time formatting (date-time-preferences D7). Its formatter becomes the same rule as `describeDue`: today and tomorrow from two new worker texts ("Today", "Tomorrow", pinned to the catalog's translations like the others), the weekday through `Intl` in the stored language, else the compact date it already writes. Its "today" is the device's calendar day when the notification shows. The worker does not know the day start, and a push is shown at its firing time. `src/lib/pushWorker.test.ts` checks the copy against `describeDue` with one table of cases.

## D3. Payload
With content opted in, `Payload` gains `due`, the task's floating due (`{date, time?, tz?}`) as stored. It is sent only when the title may be sent: never for an encrypted account, never without the device's opt-in. The worker formats it as in D2 when the task is not on the device. The field is optional and additive, and older workers ignore it. The payload still never carries the description.

## D4. Shells
`ShellReminder` gains an optional `due` (the text of D1), set when `title` is: with the titles option on, for an account that is not encrypted. Android's `ShellReminder` and iOS's `Reminders.Handed` read it (at most 100 characters). Android sets it as the notification's content text in place of "Reminder". iOS sets it as `content.body`, which today is empty. A reminder pushed through UnifiedPush has no due text of its own, so the Android app takes it from the same reminder in its stored schedule, and falls back to the generic text without one. The shared bridge fixtures (`reminders.json` and the others) carry `due`, so both apps' fixture tests read the same payloads.

The text is built in the language and formats of the web app when the schedule is handed over. A change of language reaches the shells with the next hand-over (any reminder or task change, or the hourly background run).

## D5. High priority (follow-up)
iOS's `.timeSensitive` interruption level requires the `com.apple.developer.usernotifications.time-sensitive` entitlement, a new capability for the app and its review. Web Push has no level beyond `requireInteraction`. Android's reminder channel already has high importance. The project already rings urgent reminders as alarms on iOS (ios-urgent-alarms). Mapping priority 1 to an interruption level is a separate change.

## Data model and size
No op, field or route change. The push payload gains one optional field and the bridge entry one optional field. No dependency, a few hundred bytes in the service worker, no effect on image size or memory.

## Interface budget
No screen changes: notifications only.
