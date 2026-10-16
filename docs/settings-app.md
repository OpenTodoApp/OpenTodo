---
title: "Settings: App"
summary: The General, Notifications and Capture sections of Settings, the start view, date and time formats, the calendar grid, keyboard options, quick add, voice and email to task.
audience: user
section: Guides
specs: [date-time-preferences]
screens: [settings/general#general, settings/preferences#general, settings/date-time#date-and-time, settings/email#capture]
order: 142
---

# Settings: App

<picture><source srcset="images/settings-notifications-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-notifications-light.webp" alt="Settings, Notifications section with the options Enable notifications on this device and Include task titles."></picture>

The **App** group of [Settings](settings.md) is about how the app behaves. Settings marked "this device" belong to the device you're on; the others follow your account.

## General

- **Start view**: the view this device opens on, including **Display: Today** and **Display: Upcoming** for a tablet or a wall panel; a project or saved view display is pinned from the display's own menu. See [Views](views.md#choose-where-the-app-opens) and [Display mode](display-mode.md).
- **Date and time**: how dates and times look and where weeks start, on all your devices (see below).
- **Calendar**: when the Day and Week grid starts and ends, and how long your working day is. See [Time blocking](time-blocking.md#adjust-the-grid).
- **Keyboard**: **Show shortcut hints** prints the keys in the app itself (next to quick add, beside the sidebar's destinations, in prompts) as well as in tooltips and menus, and **Vim keybindings** turns the Vim layer on; both for this device. See [Keyboard shortcuts](keyboard.md#vim-keybindings).

### Date and time

Three choices that follow your account to every device, also when you change them offline:

- **Date format**: **System** (the way this browser writes dates), **Day-month** (`14 Oct`, `14/10/2026`), **Month-day** (`Oct 14`, `10/14/2026`) or **ISO** (`2026-10-14`). Each option shows today's date in that format. Month and weekday names stay in your browser's language.
- **Time format**: **System**, **12-hour** (`3:00 PM`) or **24-hour** (`15:00`).
- **First day of the week**: **System**, **Monday**, **Sunday** or **Saturday**. It decides where the Week view and the calendar of a date field start, and which days `this week` and `last week` cover in [filters](filters.md#periods).

The **Preview** shows a due date, a date, a due time, a comment time and this week as they will appear. A change applies at once everywhere in the app, without a reload: task rows, the task detail, reminders, the Day and Week views, comments, history and the lists in Settings. With a numeric date order on **Automatic**, quick add reads dates like `3/11` in your date format too.

## Notifications

Push notifications for reminders on this device, and a test that shows whether they arrive. See [Notifications](notifications.md) and [Push notifications](push-notifications.md).

## Capture

- **Quick add**: turn natural-language parsing on or off, pick the languages it understands, and the order of day and month in dates like `12/11`. See [Quick add syntax](quick-add.md#languages).
- **Voice capture**: dictate tasks into quick add. Off until you turn it on, and the app explains first what your browser does with the audio. See [Quick add syntax](quick-add.md#voice).
- **Bookmarklet and extension**: the **Add to OpenTodo** bookmarklet, to save the page you're reading as a task. See [Capturing pages](capture.md).
- **Email to task**: your own secret address; emails sent there become tasks. See [Email to task](email.md).
