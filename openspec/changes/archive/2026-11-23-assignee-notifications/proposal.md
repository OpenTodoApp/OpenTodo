## Why

A shared task assigned to you, or completed by a teammate, is only seen in the in-app bell or a delivery channel. Issue #1904 asks for opt-in device notifications for new assignments and status changes on tasks assigned to you, that open the task, never for your own edits. The server already emits "assigned you" events and already leaves out a change's author (`task-assignment`); Web Push already reaches the PWA on computers and phones (`reminders`); the delivery channels already carry `assigned` (`notification-channels`). What is missing is the push of these events to a device and a status event.

## What Changes

- A new event, **status**: a task assigned to you was completed or reopened by someone else. It is emitted after the batch commits, like `unblocked`, and never for a change the assignee made.
- Web Push carries **assigned** and **status** to the devices that opted in, with a notification that names who did it and opens the task. The task title is included only when the device opted in to titles, as for reminders.
- Per device, two new choices beside "Include task titles" in Settings → Notifications: **Assigned to me** and **Completed or reopened**. Both are off until the user turns them on; they are stored with the device's push subscription.
- Delivery channels gain the `status` event, off by default.
- The in-app bell is unchanged: it has no per-event choice, so it does not get the status event.

## Out of scope

- The iOS and Android apps: they do not use Web Push subscriptions (OpenSpec `native-shells`), so they get these events only through a delivery channel. Real-time push to the iPhone needs the relay that is paused (#1377).
- A desktop app (`desktop-shell`, ROADMAP "Native shells" row 3). On a computer this works in the browser or the installed web app.
- Events for other edits (title, due date, section or board column), comments other than mentions, and anything for tasks not assigned to the recipient.
- Delivery retries or a durable queue for these pushes: they are best effort, as the bell's events are.

No new environment variable, no op field, no **BREAKING** change. Advances ROADMAP "Assignees and in-app notifications" (`task-assignment`) and "Reminders and web push notifications" (`reminders`).
