---
title: App icon badge
summary: The number of today's open tasks on the installed app's icon, where it works, why iPhone and iPad need notifications, and how it updates while the app is closed.
audience: user
section: Guides
specs: [app-icon-badge]
screens: [app-icon-badge]
order: 87
---
# App icon badge

<picture><source srcset="images/mobile-today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/mobile-today-light.webp" alt="OpenTodo installed on a phone, showing the Today list whose open tasks the icon badge counts."></picture>

Where the system supports it, the installed app's icon shows how many of today's tasks are still open. It is the same number as **Today** in the sidebar: overdue tasks, tasks due or started today and deadlines that have come, all of them, not only the places your [Today limit](today-limit.md) leaves.

Completing, adding, deleting or rescheduling a task changes the number at once, and so do changes that sync in from your other devices. When nothing is left for today, the badge goes away.

## Where it works

- The app added to the home screen on iPhone and iPad, with iOS or iPadOS 16.4 or later ([Install on your phone](install-phone.md#iphone-and-ipad)).
- Apps installed from Chrome or Edge on a computer or on Android ([Installing the app](install-app.md)).

The switch, **Show today's count** under **Settings → Notifications → App icon badge**, only appears on a device that can show badges. It is on by default and applies to this device only. Turning it off, or signing out, removes the badge.

## On iPhone and iPad

iOS shows the badge only once notifications are allowed for the app. Turn on **Enable notifications on this device** in the same settings page and allow notifications when asked ([Push notifications](push-notifications.md)).

## While the app is closed

Nothing on a phone can run a web app on a schedule, so the badge keeps its last number until you open the app again, or until a reminder push arrives. While it runs, the app keeps the counts of the next seven days as this device sees them; when a push arrives, the badge takes the count for the current day. A task due today that is still open is counted as overdue tomorrow, so a morning reminder brings the right number.

Changes made on another device while the app was closed show the next time you open it. The push itself carries no count and nothing else new, so [end-to-end encryption](e2ee.md) and what a push contains are unchanged.
