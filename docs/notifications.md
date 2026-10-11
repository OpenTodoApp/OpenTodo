---
title: Notifications
summary: The bell for assignments and mentions, reminder pop-ups inside the app, and push notifications on each device when the app is closed.
audience: user
section: Guides
specs: [reminders, task-assignment]
screens: [settings/notifications#get-reminders-when-the-app-is-closed]
order: 80
card: notifications
---
# Notifications

OpenTodo tells you about three things: a task someone assigned to you, a comment that mentions you, and reminders you set. Nothing else, and never anything from outside your server.

## The bell

The bell at the top right shows a red count when something new arrived from other people:

- **assigned you**: someone assigned you a task in a shared project,
- **mentioned you**: someone wrote `@your name` in a comment.

<picture><source srcset="images/notifications-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/notifications-light.webp" alt="The notifications list open under the bell: Sam Rivera mentioned you on a task, and Sam Rivera assigned you a task."></picture>

Select an entry to open the task. Opening the task marks it as read. You don't get notified about your own actions.

## Reminders inside the app

While OpenTodo is open, a reminder appears in the corner of the screen when it's due, with **Snooze 10 min**, **1 hour**, **Tomorrow 09:00** and **Dismiss**. It needs no permission and no connection. Press <kbd>Esc</kbd> to dismiss it.

If the OpenTodo tab is in the background and your browser allows notifications for it, you get a system notification instead.

How to add reminders is covered in [Recurring tasks and reminders](recurring-and-reminders.md#add-a-reminder).

## Get reminders when the app is closed

Push notifications deliver reminders even when OpenTodo isn't open. Each device decides for itself.

1. Open **Settings → Notifications** on the device.
2. Tick **Enable notifications on this device** and allow notifications when the browser asks.
3. Select **Send test notification** to check that one arrives.

<picture><source srcset="images/settings-notifications-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-notifications-light.webp" alt="Settings, Notifications section with the options Enable notifications on this device and Include task titles."></picture>

Repeat this on every device where you want them: your phone, your laptop, your tablet. Turning it off, or signing out, removes that device.

From a push notification you can **Snooze 10 min** or **Dismiss**, and that applies on all your devices.

### On iPhone and iPad

Push needs iOS or iPadOS 16.4 or later, and only works in the installed app. Add OpenTodo to your home screen first ([Installing the app](install-app.md#iphone-and-ipad)), open it from there, then turn on notifications in its settings.

### Privacy

A push message goes through your browser's push service (run by the browser maker). It contains only an id and a time, encrypted so the push service can't read it. Your device then shows the title from its own copy of the task.

**Include task titles** puts the title in the encrypted message as well, so the notification can show it even before that device has synced the task. Notes are never sent. If your account uses [end-to-end encryption](e2ee.md), titles are never included.

## When notifications don't arrive

- **"Notifications are blocked for this site"**: you said no when the browser asked. Allow notifications for your OpenTodo address in the browser's site settings, then select **Re-enable**.
- **"Push notifications are turned off on this server"**: the person running your server has switched push off. Reminders still show inside the app.
- **"This browser does not support push notifications"**: try the installed app, or open OpenTodo over `https://`.
- **Nothing arrives on a phone**: check that the operating system allows notifications for the app (or the browser), and that battery saving or focus modes aren't holding them back.

More fixes in [Troubleshooting](troubleshooting.md).
