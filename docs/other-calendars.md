---
title: Other calendars in Day and Week
summary: Subscribe to a Google, Outlook, Apple, Fastmail or Nextcloud calendar so its events appear next to your tasks: the steps per app, refreshing, what you see, and the limits.
audience: user
section: Guides
specs: [calendar-feeds]
screens: []
order: 64
---
# Other calendars in Day and Week

<picture><source srcset="images/week-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/week-light.webp" alt="The Week calendar with timed tasks as blocks, where events from subscribed calendars are shown beside them."></picture>

With [calendar feeds](calendar-feeds.md) turned on by the server owner, you can subscribe to up to ten of your other calendars. Their events are read-only in OpenTodo and never count toward a day's planned total; they're there so you can see your real free time while you plan.

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
- Events can't be dragged, resized or completed. Tab onto an event and press Enter, or click it, to see its time, location and calendar.

The **Calendars** button in the calendar's toolbar hides or shows events on this device only. Your choice is kept when you reload.

Events are cached on each device, so Day and Week still show them offline, as of the last refresh. The toolbar then says **Calendars as of** and the time. Weeks your device has not loaded yet show no events while you're offline.

### Limits

- Up to 10 calendars per person.
- A calendar may be up to 2 MB. Events from 30 days ago to a year ahead are kept, up to 5,000 per calendar.
- Repeating events are expanded on the server. A repeat rule OpenTodo doesn't understand shows its first occurrence only, and the calendar's row gets a warning. A calendar whose events repeat so much that expanding them would take more than a few seconds keeps the occurrences found so far, with a warning that some events are left out.
- **Refresh now**, adding a calendar and changing its address count toward 12 fetches per person per hour.
- Calendars on a private network (your NAS, a home server) are refused unless the server owner allows private network targets for [webhooks](webhooks.md#private-network-protection). The same switch applies to both.
