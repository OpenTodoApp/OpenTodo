---
title: Notifications, install and app problems
summary: What to check when reminders don't arrive, the app won't install, a passkey can't be added, quick add misreads a word, or the app looks old or breaks on screen.
audience: user
section: Guides
specs: []
screens: []
order: 152
---
# Notifications, install and app problems

<picture><source srcset="images/settings-notifications-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-notifications-light.webp" alt="Settings → Notifications on a device where the browser has blocked notifications, with the switch off and a notice explaining why."></picture>

These are the problems that live on one device: notifications, installing, passkeys, quick add and the app itself. The shorter list is in [Troubleshooting and FAQ](troubleshooting.md).

## Reminders don't arrive

Inside the app, reminders pop up while it's open. To get them when the app is closed, push notifications must be turned on for each device in **Settings → Notifications**, and on an iPhone only the installed app can receive them. [Notifications](notifications.md#when-notifications-dont-arrive) lists the messages you might see and what to do.

## I can't install the app or add a passkey

Both need your server to be on a secure `https://` address. If the browser offers no install option, or **Settings** has no Security section for passkeys, ask whoever runs your server. Instructions per device are in [Installing the app](install-app.md).

## Quick add got it wrong

If a word was read as a date, project or priority by mistake, select the **×** on its chip before you press <kbd>Enter</kbd>, or press <kbd>Backspace</kbd> twice at the end of the line. Text in double quotes is never interpreted: `Read "Next Friday"`. You can also switch parsing off in **Settings → Capture → Quick add**. See [Quick add syntax](quick-add.md#preview-chips).

## The app looks out of date

The app updates itself when your server is updated. An open tab shows **A new version of OpenTodo is ready** with a **Reload to update** button; a screen whose code changed in the update reloads on its own. If something still looks old, close it completely (all tabs or the installed window) and open it again.

If a tab says **A newer version of OpenTodo is open in another tab**, reload it: the other tab updated the data stored on this device, and the older tab can no longer save changes.

## Something went wrong on screen

If a part of the app fails to display, you see a message with a **Reload** button in its place; the sidebar and other screens keep working. Your tasks are stored on the device and aren't lost by reloading.

If a change can't be made (for example moving a task under one of its own subtasks), a message at the bottom of the screen says why.
