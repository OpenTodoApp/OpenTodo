## Context

Notification buttons write ordinary ops. On Android the shell hands a button to the web app in a hidden web view at `/?reminder=<id>&action=snooze|dismiss|done` (`shellActions.ts`), and `done` already completes the task with `completeTask` for location reminders. In the browser, `push-sw.js` writes Snooze and Dismiss itself: a reminder's fields straight into IndexedDB and the outbox, uploaded by an open window or by the worker's own `POST /api/v1/sync` with the session cookie.

## Goals / Non-Goals

**Goals:** Done on every reminder notification by time, completing the task exactly like the app (a repeating task advances); working offline and on an encrypted account; the same words everywhere.

**Non-Goals:** Done in the in-app toast; the iOS shell; delivery channels; a background completion in the browser with no window at all.

## Decisions

### D1. The browser completes through the app, never in the worker

Completing is not one field. `completeTask` reads the series' rule, plans the occurrence record (an entity whose id derives from the series and date, copying the title and notes), moves the series, completes open subtasks and stops a running timer, all in one batch. The worker is plain JavaScript outside the bundle; copying that logic into it would be a second completion that drifts from the first. Worse, the worker's direct upload sends ops as they are, and the occurrence record's title is content: on an encrypted account it must be encrypted, which only the app's upload (`prepareOutgoing`) does.

So the worker never writes a completion. With a window of the app open, it posts `reminders:done` to exactly one window (the visible one, else the first: two windows would each complete, and a series would move twice), and the app runs `applyReminderAction(id, 'done')`, the shell's path. With no window, it opens the app at `/?reminder=<id>&action=done`, the address the Android app uses; the Shell reads it on start, completes the task and removes the address. Alternatives considered: queuing the action for the app's next start leaves the task open on every other device until this one is opened again, possibly for days; opening a window that closes itself again is not reliably allowed (`window.close()` on a window the worker opened) and flashes. Opening the app is visible, but the completion lands at once.

### D2. Offline and encrypted accounts need nothing new

`completeTask` writes the local rows and the outbox like any edit, so offline the task is done on the device and uploaded on the next sync, as Snooze and Dismiss are. On an encrypted account the batch is encrypted at upload; the completion itself writes no content beyond the occurrence record's copied fields, which `prepareOutgoing` encrypts. A locked device keeps the ops in the outbox until it is unlocked, like any other change.

### D3. Order and the two-button limit

Done, Snooze 10 min, Dismiss, on Android (three buttons fit) and in the push notification. Chrome shows at most two buttons (`Notification.maxActions`); the worker cuts the list to that number, so Done and Snooze 10 min stay. Dismiss stays in the app's toast and the task's panel; swiping a notification away was never a dismissal.

### D4. Delivery channels get no button

ntfy supports HTTP action buttons, but a button that completes a task from the ntfy app needs a request authenticated to the server: a token or a signed link inside the message, readable by the push service and anyone with the topic. Pushover and Gotify have no action buttons of that kind. Their messages keep the link that opens the task.

### D5. Strings

The worker's texts are pinned to the catalogs by `pushWorker.test.ts`. The existing message `Done` is the dialog button ("Fertig" in German), not a completed task, so the worker uses a new message `Done|task` (shown as "Done"), translated as the Android app's `action_done`: Erledigt, Terminé, Hecho, Fatto, Concluído, 完成.

## Risks / Trade-offs

- [With no window open, Done in the browser opens the app] → it completes at once and shows Today; on Android nothing opens.
- [A window that is frozen in the background gets the message late] → it completes when it runs again; the notification is already closed.

## Data model, size and memory

No new entity, field or op. The worker grows by about 1 KB; the first-load bundle by a few bytes (`ReminderToasts`). No dependency.
