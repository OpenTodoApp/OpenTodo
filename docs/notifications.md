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
3. Select **Send test notification**. Your server sends a real push to this device, the same way it sends reminders, and a notification appears even while OpenTodo is open.

<picture><source srcset="images/settings-notifications-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-notifications-light.webp" alt="Settings, Notifications section with the options Enable notifications on this device and Include task titles."></picture>

Repeat this on every device where you want them: your phone, your laptop, your tablet. Turning it off, or signing out, removes that device.

From a push notification you can **Snooze 10 min** or **Dismiss**, and that applies on all your devices.

### Check that it works

Below the options, **Delivery check** lists everything push needs on this device, with a fix next to each problem:

| Step | What it means |
| --- | --- |
| Browser supports push | Private windows and some browsers can't receive push at all. |
| Notifications allowed | You allowed notifications for this site when the browser asked. |
| Offline service worker active | The background part of the app that receives pushes is running. Reload if it isn't. |
| Subscribed on the server | Your server knows where to send pushes for this device. Select **Enable** if not. |
| Server reaches the push service | The last push to this device went through. After failures it shows the error; select **Re-enable**. |
| Test notification received | This device reported the last test. |

After **Send test notification** you see one of these:

- **Received on this device**: the push arrived and the notification was handed to your system. Reminders will reach this device while the app is closed. If you still saw no banner, your operating system hid it (see below).
- **Accepted, but this device has not reported receiving it**: your server delivered the push to the browser's push service, but nothing reached this device within a few seconds. Check the operating system's notification settings for your browser or the app, focus and do-not-disturb modes, and on iPhone and iPad use the installed app. If it arrives late, the result updates to received.
- **This device is not subscribed**: nothing was sent. Tick **Enable notifications on this device** first.
- **The subscription expired**: the push service no longer accepts it and your server removed it. Select **Enable** to subscribe again.
- **The push service rejected the test**: the message shows its answer. Try **Re-enable**; if it keeps failing, the push service may be unreachable from your server.

You can run up to five tests in ten minutes. Without a subscription, **Show a local notification** shows one straight from the page: it only proves that the browser may show notifications, not that reminders reach the device.

### On iPhone and iPad

Push needs iOS or iPadOS 16.4 or later, and only works in the installed app. Add OpenTodo to your home screen first ([Installing the app](install-app.md#iphone-and-ipad)), open it from there, then turn on notifications in its settings.

### Privacy

A push message goes through your browser's push service (run by the browser maker). It contains only an id and a time, encrypted so the push service can't read it. Your device then shows the title from its own copy of the task.

**Include task titles** puts the title in the encrypted message as well, so the notification can show it even before that device has synced the task. Notes are never sent. If your account uses [end-to-end encryption](e2ee.md), titles are never included.

## When notifications don't arrive

- **"Notifications are blocked for this site"**: you said no when the browser asked. Allow notifications for your OpenTodo address in the browser's site settings, then select **Re-enable**.
- **"Push notifications are turned off on this server"**: the person running your server has switched push off. Reminders still show inside the app.
- **"This browser does not support push notifications"**: try the installed app, or open OpenTodo over `https://`.
- **The test says accepted but not received**: the push left your server but didn't reach this device. On a Mac, check **System Settings → Notifications** for your browser; on Windows, **Settings → System → Notifications**; on Android, the browser's or app's notification settings; on iPhone and iPad, the installed app's notification settings. Focus and do-not-disturb modes hide notifications too.
- **Nothing arrives on a phone**: check that the operating system allows notifications for the app (or the browser), and that battery saving or focus modes aren't holding them back.
- **Running OpenTodo from source with `make dev`**: development builds have no service worker, so push can't work there and the delivery check says so. Use the production build (`make run`, http://localhost:8080) to test push.

More fixes in [Troubleshooting](troubleshooting.md).
