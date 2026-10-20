---
title: Calendar feeds
summary: Show your other calendars next to your tasks in Day and Week, and subscribe to your tasks from Google Calendar, Outlook or Apple Calendar.
audience: user
section: Guides
specs: [calendar-feeds]
screens: [settings/calendar-feeds]
order: 63
---
# Calendar feeds

<picture><source srcset="images/week-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/week-light.webp" alt="The Week calendar with timed tasks as blocks, where events from subscribed calendars are shown beside them."></picture>

Calendar feeds work in both directions:

- **Other calendars in OpenTodo.** Subscribe to the iCal address of a Google, Outlook, Apple, Fastmail or Nextcloud calendar, and its events appear next to your tasks in [Day and Week](calendar-views.md). You see your real free time while you plan.
- **Your tasks in your calendar app.** Create a private feed address, then subscribe to it from Google Calendar, Outlook or Apple Calendar. Your dated tasks show up there as events.

Both directions are read-only. Events from other calendars can't be moved or edited in OpenTodo, and calendar apps can't change your tasks. For two-way sync with apps that support it, use [CalDAV](caldav.md).

Calendar feeds are off until the server owner turns them on under **Settings → Integrations → Calendar feeds**. The server fetches the calendar addresses itself; private network addresses follow the owner's webhooks setting.

## Subscribe to another calendar

Copy the calendar's iCal or `webcal://` address from its app, then open **Settings → Integrations → Calendar feeds**, choose **Add calendar** and paste it, with a name and a colour if you like. The server fetches the calendar straight away and then on its own schedule, and its events appear in Day and Week beside your tasks. [Other calendars in Day and Week](other-calendars.md) has the steps for each calendar app, what the events look like, how refreshing works, and the limits.

## Your tasks as a calendar

In **Settings → Integrations → Calendar feeds**, under **Your tasks as a calendar**, choose **Create feed URL**. The address is shown **only once**, so copy it right away. Then subscribe to it:

- **Google Calendar**: *Other calendars* → **+** → **From URL**.
- **Outlook**: *Add calendar* → **Subscribe from web**.
- **Apple Calendar**: **File → New Calendar Subscription**.

The feed holds your open tasks due from 30 days ago to a year ahead, including tasks in projects shared with you. Tasks in archived projects are left out. Repeating tasks repeat in the calendar app too. A task with a time and an estimate becomes an event of that length. A task with a time but no estimate becomes a 30-minute event, and a date-only task becomes an all-day event. Completed tasks drop out. Calendar apps refresh subscriptions on their own schedule, which can be every few minutes or once a day.

### Rotate or revoke

Anyone who has the address can read the tasks in it, so treat it like a password.

- **Rotate** creates a new address. The old one stops working at once, so calendar apps need the new address.
- **Revoke** turns the feed off.

The panel shows when the address was created and when a calendar app last fetched it.

## End-to-end encryption

With [end-to-end encryption](e2ee.md) on, the server can't read your task titles. In the task feed they appear as "Encrypted item". Dates and times are still correct. Events from your other calendars are stored unencrypted on the server, like any other data the server fetches for you.

## On the demo

The public demo refuses calendar feeds, both subscriptions and the task feed, because they make the server fetch arbitrary addresses. See [Demo instance](self-hosting/demo.md).
