---
title: Calendar feeds
summary: Show your other calendars next to your tasks in Day and Week, and subscribe to your tasks from Google Calendar, Outlook or Apple Calendar.
audience: user
section: Guides
specs: []
screens: [settings/calendar-feeds]
order: 62
---
# Calendar feeds

Calendar feeds work in both directions:

- **Other calendars in OpenTodo.** Subscribe to the iCal address of a Google, Outlook, Apple, Fastmail or Nextcloud calendar, and its events appear next to your tasks in [Day and Week](time-blocking.md). You see your real free time while you plan.
- **Your tasks in your calendar app.** Create a private feed address, then subscribe to it from Google Calendar, Outlook or Apple Calendar. Your dated tasks show up there as events.

Both directions are read-only. Events from other calendars can't be moved or edited in OpenTodo, and calendar apps can't change your tasks. For two-way sync with apps that support it, use [CalDAV](caldav.md).

Calendar feeds are off until the server owner turns them on under **Settings → Integrations → Calendar feeds**.

## Subscribe to another calendar

1. Copy the calendar's iCal address from its app:
   - **Google Calendar**: Settings → the calendar → *Integrate calendar* → **Secret address in iCal format**.
   - **Outlook**: Settings → Calendar → Shared calendars → *Publish a calendar* → the **ICS** link.
   - **Apple iCloud**: Calendar → the calendar's share button → **Public Calendar**, then copy the `webcal://` link.
   - **Fastmail and Nextcloud**: the calendar's *Share* or *Export* menu offers an iCal or `.ics` address.
2. In OpenTodo open **Settings → Integrations → Calendar feeds** and choose **Add calendar**.
3. Paste the address, and optionally give the calendar a name and a colour. `webcal://` addresses work too.

The server fetches the calendar straight away and then on its own schedule: as often as the calendar asks (between every 30 minutes and once a day), and every hour by default. **Refresh now** in a calendar's menu fetches it at once.

Each calendar's row shows when it was last refreshed. When fetches fail, the row shows the error and the time of the last successful refresh. A calendar that keeps failing is retried less and less often, up to every six hours. **Disable** stops fetching it and hides its events. **Delete** removes it and its events from every device.

### What you see in Day and Week

- Timed events are drawn as blocks in the calendar's colour, next to your task blocks. When a task and an event overlap, both get the overlap marker.
- All-day and multi-day events appear as chips above each day's unscheduled lane.
- Events marked as *free* in their calendar are drawn as an outline only, so the slot still reads as free.
- Events never count toward the day's planned total.
- Tab onto an event and press Enter, or click it, to see its time, location and calendar.

The **Calendars** button in the calendar's toolbar hides or shows events on this device only. Your choice is kept when you reload.

Events are cached on each device, so Day and Week still show them offline, as of the last refresh. The toolbar then says **Calendars as of** and the time. Weeks your device has not loaded yet show no events while you're offline.

### Limits

- Up to 10 calendars per person.
- A calendar may be up to 2 MB. Events from 30 days ago to a year ahead are kept, up to 5,000 per calendar.
- Repeating events are expanded on the server. A repeat rule OpenTodo doesn't understand shows its first occurrence only, and the calendar's row gets a warning.
- **Refresh now**, adding a calendar and changing its address count toward 12 fetches per person per hour.
- Calendars on a private network (your NAS, a home server) are refused unless the server owner allows private network targets for [webhooks](webhooks.md#private-network-protection). The same switch applies to both.

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
