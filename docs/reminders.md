---
title: Reminders reference
summary: How relative, deadline and absolute reminders fire, web push and its privacy, snooze, shared projects and the Trash.
audience: user
section: Reference
specs: [reminders]
screens: []
order: 40
---
# Reminders reference

A task can carry any number of reminders (OpenSpec change `reminders`). Open a task, then use the **Reminders** section of the detail panel.

You can also type reminders in quick add: `Dentist tomorrow at 15:00 remind me 30 min before` (see [Repeat and remind](quick-add.md#repeat-and-remind)).

- **Relative** reminders fire a number of minutes before or after the task's due time ("30 minutes before"). A task with a date but no time counts as due at 09:00. A task whose time is fixed to a time zone fires relative to that exact instant, wherever your devices are. When the due date or time changes, on any device or through the API, the reminder moves with it; recurring tasks carry their relative reminders to the next occurrence. Without a due date a relative reminder is kept but does not fire.
- **Deadline** reminders fire a number of minutes before or after 09:00 on the task's [deadline](tasks-and-projects.md#deadlines) ("1 day before the deadline"), in your device's time zone. They follow the deadline when it changes, on any device or through the API, and never move with the due date. Without a deadline the reminder is kept but does not fire. A device on an older version leaves them untouched.
- **Absolute** reminders fire at a moment you pick and never move with the due date. They work on undated tasks and are shown in each device's local time.

## Default reminders

**Settings → Notifications → Default reminders** holds two synced preferences, one for tasks with a time and one for tasks with a date only (counted from 09:00). When a write gives a task that had no due date a due date, the device (or, for agents and REST calls that ask for it, the server) adds one ordinary relative reminder with the matching default in the same batch, unless the task is completed, deleted or a habit, already has a live relative reminder, gets one in the same write, or already had its default reminder. The reminder's id is derived from your account and the task, so two devices scheduling the same task offline end with one reminder, and a default reminder you deleted is not added again. A task whose due switches between a date only and a time takes the other default while its default reminder is unchanged. Undo, redo, restoring a version and restoring from the Trash never add one; Undo removes the one it added. See [Task reminders](default-reminders.md) and the [API](api.md#default-reminders).

## Shared projects

Reminders are personal. On a task in a shared project your reminders are yours alone: other members never see or receive them, and you can add them with any role, viewer included. When someone else moves the task, your relative reminders follow as soon as one of your devices syncs.

## Delivery

**In the app.** While the app is open, a reminder whose time has come appears as a notification in the corner with **Snooze 10 min**, **1 hour**, **Tomorrow 09:00** and **Dismiss** (focus moves to it; <kbd>Esc</kbd> dismisses). This needs no network and no permission, and is skipped for completed or deleted tasks. When the tab is in the background and the browser allows notifications, a system notification is shown instead.

**Web push.** In **Settings → Notifications** each device can enable push so reminders arrive while the app is closed. Enabling asks for the browser permission and registers the device with the server; disabling or signing out removes it. The server sends each reminder at its firing time, once per firing time, to every enabled device of the reminder's owner (reminders are personal), then records the delivery on the reminder (an op by device `server`) so all devices know it fired. A reminder that falls due on a completed task is not sent; the server records it as dismissed instead (also an op by device `server`), so it is not checked again. Reopening the task does not bring that firing back; set a new time or snooze it to be reminded again. System notifications offer **Snooze 10 min** and **Dismiss**; these work offline and are uploaded on the next sync. Their text and the due date are written in the account's [interface language](language.md), which the service worker reads from the synced preferences row on the device (English when there is none). If the app is focused when a push arrives, the reminder is shown in the app only.

**Privacy.** A push payload carries only the reminder id, the task id and the firing time, encrypted end to end (RFC 8291) so the push service cannot read it. The device shows the title from its own copy of the task. Enable **Include task titles** if a device should be able to show the title before it has synced the task; the description is never sent.

## Trash

A reminder does not fire, in the app or by push, while its task is deleted or while the task's project, or any project above it, is in the Trash. It is not marked as delivered either, so restoring the task or the project brings it back: a reminder whose time is still ahead fires on time, and one whose time passed while it was in the Trash is delivered once, late, on the next check (the same rule as for reminders that fell due while the server was down). Dismiss or snooze it if you no longer need it. Purging the task from the Trash removes its reminders.

## Snooze and dismiss

Snoozing sets a new firing time (in 10 minutes, in an hour, or tomorrow at 09:00) and the reminder fires again, also by push. Dismissing silences the current firing. Both are ordinary synced edits: when one device dismisses and another later snoozes the same reminder, the later edit wins on every device.

## End-to-end encryption

For an account with [end-to-end encryption](e2ee.md) the server never puts a title in a push, even for devices that opted in to titles: it cannot read it, and ciphertext would be useless. The notification uses the content-free text; in-app reminder toasts still show the decrypted title from the device.

## For operators

Nothing to configure. The VAPID key pair is generated on first use at `<data>/push_vapid.pem` and travels with backup archives. `OPENTODO_PUSH=off` turns push off entirely (routes answer 404, no outbound requests); in-app reminders keep working. Push requires the app to be served over https (`OPENTODO_BASE_URL`), as browsers only allow push subscriptions on secure origins. See [self-hosting](self-hosting/docker.md#reminders-and-web-push) and [API](api.md#reminders-and-push).
