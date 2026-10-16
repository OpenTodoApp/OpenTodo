---
title: The app in your language
summary: Pick the language of the app once and every device follows: English, German, French, Spanish, Italian or Portuguese, with dates, notifications and quick add to match.
audience: user
section: Guides
specs: []
screens: []
order: 143
---
# The app in your language

<picture><source srcset="images/settings-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-light.webp" alt="The Settings page with its You and App groups; the first section of the App group holds the language, the start view and the date and time options."></picture>

OpenTodo speaks **English**, **Deutsch**, **Français**, **Español**, **Italiano** and **Português**. Pick one in **Settings → General → Language**; each is listed in its own language, so you can find yours whatever the app shows now.

- **System** uses the first language of your browser that the app has, and English otherwise. The option names the language it picked, for example *System (Deutsch)*.
- Your choice belongs to your account: every device you sign in on switches to it after the next sync, also when you changed it offline.
- The app switches at once, without a reload.

## What changes

- Every menu, button, message and notice of the app.
- **Dates and times**: month and weekday names, and on **System** the order of day and month and the clock, follow the language. Your browser's region is kept when it is the same language, so Swiss German stays Swiss German. Your own [date and time formats](settings-app.md#date-and-time) still win.
- **Quick add and voice** try the language you picked first, then your browser's languages, unless you chose their languages yourself in [Capture](settings-app.md#capture). See [Quick add syntax](quick-add.md#languages).
- **Reminder notifications** on your phone or computer, including **Snooze 10 min** and **Dismiss**. See [Notifications](notifications.md#language).
- **Messages from the server**, such as a wrong password, are shown in your language.

## What stays the same

- Your tasks, projects, labels and comments are never translated.
- Filter queries and repeat rules keep their English keywords (`due <= tomorrow`, `every weekday`), so a saved view works in every language.
- The guide in **Help** and this documentation are in English; Help says so in your language.
- The browser extension follows your browser's language. See [Capturing pages](capture.md#browser-extension).

## Offline

A language is loaded the first time you pick it and then kept on the device, so switching later works offline. If it cannot be loaded (for example on a new device without a connection), the app stays in its current language, the setting says so, and your choice applies as soon as it can.
