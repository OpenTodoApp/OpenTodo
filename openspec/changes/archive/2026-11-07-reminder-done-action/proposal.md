## Why

A reminder notification offers **Snooze 10 min** and **Dismiss**, but not the one thing most people want when it fires: tick the task off (issue #967). Location reminders already have **Done** in the Android app; reminders by time, on Android and through web push, do not.

## What Changes

- Every reminder notification by time offers **Done** first, then **Snooze 10 min** and **Dismiss**: the Android app's notification and the web push notification. A browser that shows only two buttons (Chrome) shows **Done** and **Snooze 10 min**.
- **Done** completes the task through the app's own completion (`completeTask`): a repeating task records the occurrence and moves to its next one, its open subtasks complete, a running timer on it stops, and completing disarms its reminders.
- On Android the hidden web view applies it, as it already does for Snooze, Dismiss and a location reminder's Done: nothing opens. In the browser the service worker hands it to an open window of the app; with none open it opens the app at the address the Android app uses for Done, which completes the task and shows Today (design D1).
- The button's text comes from the existing catalogs: a new message `Done|task` in every shipped language, the same words as the Android app's `action_done`.

Out of scope: **Done** in the in-app reminder toast and in the iOS app's notifications (a follow-up), and buttons on delivery channels (ntfy, Pushover, Gotify, webhooks): an action that changes a task from outside the app would need a credential in the message (design D4). Not **BREAKING**: no new op, field, route or environment variable. Issue #967; no ROADMAP.md row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `reminders`: system notifications of a reminder offer Done, which completes the task like the app does.

## Impact

`web/public/push-sw.js` (the Done button and its handling, the button order, the `done` text in its language table), `web/src/app/ReminderToasts.tsx` (the worker's `reminders:done` message), `web/src/lib/shellActions.ts` (comments only: the Done address already completes the task), one new message in every catalog. Android: `Reminders.kt` and `ReminderSchedule.kt` (the button lists), the shared bridge fixture `actions.json`. Docs: `docs/reminders.md`, `docs/push-notifications.md`, `docs/android-app.md`. The service worker is not part of the first load; the app's first-load bundle is unchanged apart from a few bytes in `ReminderToasts`.
