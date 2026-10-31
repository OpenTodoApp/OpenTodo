---
title: Calendar sync
summary: Two-way sync with the calendar you already use: your dated tasks become events in iCloud, Fastmail, Nextcloud, Google Calendar or any CalDAV calendar, and moving an event moves the task.
audience: user
section: Integrations
specs: [calendar-sync, calendar-feeds, end-to-end-encryption]
screens: [settings/calendar-sync]
order: 33
---
# Calendar sync

Connect the calendar account you already use and OpenTodo writes your dated tasks into one of its calendars as ordinary events. Move an event to another time there, make it longer, rename it or delete it, and the task follows. Change the task in OpenTodo and the event follows. Other calendars of the same account can be shown next to your tasks in Day and Week.

It works with every calendar service that speaks CalDAV with an app password (iCloud, Fastmail, Nextcloud, Synology Calendar, Radicale, Baïkal, mailbox.org and others) and with Google Calendar. Microsoft Outlook and Microsoft 365 are not supported yet: see [Outlook](#outlook).

The server owner turns calendar sync on under **Settings → Integrations → Calendar sync**. Until then the panel says so and nothing is contacted.

## What syncs

| In OpenTodo | In your calendar |
| --- | --- |
| An open task due at 09:00 with an estimate of 45 minutes | An event from 09:00 to 09:45, titled like the task, with the notes as its description |
| A task due at a time without an estimate | A 30-minute event |
| A task due on a day without a time | An all-day event, only with **Include tasks without a time** on |
| A multi-day task, from its start date to its due date | One all-day event over those days, whatever **Include tasks without a time** says; a due time is not shown |
| A repeating task | One event for its next occurrence |
| A completed, deleted or undated task | Its event is removed |

And back:

| In your calendar | In OpenTodo |
| --- | --- |
| Drag the event to another time or day | The task's due date and time change |
| Make the event longer or shorter | The task's estimate changes |
| Make it an all-day event | The task keeps the date and loses the time |
| Move, lengthen or shorten a multi-day task's all-day event | Its first day becomes the task's start date and its last day the due date; a due time stays |
| Make a multi-day task's event a timed event | The due date and time change as for any task; the start date and the multi-day setting stay, so the next check writes the all-day event again while the start is before the due date |
| Rename the event | The task is renamed |
| Delete the event | The task stays open without a date |

With **Include tasks without a time** off, an event you make all-day is removed from the calendar at the next check; the task keeps its date.

Only events OpenTodo wrote change tasks. Your other events are never changed and never become tasks; the ones in the calendar tasks are written into are shown next to your tasks in Day and Week, read-only.

Tasks are written from 30 days back to a year ahead, the same tasks as the [task feed](calendar-feeds.md): your own and those of projects shared with you, outside archived projects. A zoned task (due 09:00 Europe/Berlin) keeps its zone; a floating task keeps its wall-clock time in your calendar's zone.

## Connect a CalDAV calendar

1. Create an **app password** at your provider (your account password usually does not work, and should not be given to another server anyway):
   - **iCloud**: sign in at account.apple.com → **Sign-In and Security** → **App-Specific Passwords**. Server `caldav.icloud.com`, username your Apple Account email.
   - **Fastmail**: **Settings → Privacy & Security → Manage app passwords and access** → **New app password** with access to calendars (CalDAV). Server `caldav.fastmail.com`, username your full Fastmail address.
   - **Nextcloud**: **Settings → Security → Devices & sessions** → **Create new app password**. Server `https://cloud.example.com/remote.php/dav`, username your Nextcloud user name.
   - **Synology, Radicale, Baïkal, mailbox.org and others**: the CalDAV address your server documents, or just its host name.
2. Open **Settings → Integrations → Calendar sync** and choose **Connect CalDAV**.
3. Enter the server (an address, a host name, or your email address: OpenTodo then asks the domain's `/.well-known/caldav`), the username and the app password, and choose **Find calendars**. The password is stored on your server, outside the database and its backups, and is never shown again.
4. Choose the calendar to **write tasks into** and, if you like, other calendars to **also show in Day and Week**. Calendars that only hold to-dos are not offered; read-only calendars (holidays, shared calendars you cannot edit) can be shown but not written into.

A calendar of its own for tasks ("OpenTodo") keeps them easy to hide or recolour in your calendar app; your main calendar works too.

## Connect Google Calendar

With a Google client set up by the server owner, choose **Connect Google**. Google asks you to sign in and to allow OpenTodo to see and edit your calendars, then sends you back to the panel to choose the calendars. You can remove the access at any time at myaccount.google.com/permissions; the connection then asks you to **Reconnect**.

### Set up the Google client (server owner)

Google only lets a server use its calendar API with an OAuth client that belongs to whoever runs the server, so each server owner creates their own, once:

1. In the Google Cloud console, create a project (or pick one).
2. **APIs & Services → Library**: enable the **CalDAV API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, enter the app name and your email, and add the scope `https://www.googleapis.com/auth/calendar`. While the app is in **Testing**, only the test users you list can connect, and Google ends their access after 7 days; **publish** the app for lasting access (Google may ask to verify it when many people use it).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**. Under **Authorized redirect URIs**, add the address shown in **Settings → Integrations → Calendar sync → Google client**, which is `https://<your server>/api/v1/calendar-sync/google/callback`. It must be the address people open OpenTodo at; set `OPENTODO_BASE_URL` when the server runs behind a proxy.
5. Copy the client ID and the client secret into **Google client** in the panel. The secret is stored in `<data>/secrets/calendar-sync.json`, never in the database, and is never shown again.

Instead of the panel, you can set `OPENTODO_GOOGLE_CLIENT_ID` and `OPENTODO_GOOGLE_CLIENT_SECRET` (or `OPENTODO_GOOGLE_CLIENT_SECRET_FILE`, a file that holds it). Both are optional; when set, they replace the panel's values, which then cannot be changed there.

## When changes travel

The server checks each connected calendar every 5 minutes, and about 20 seconds after you change a task's date, time, length, title or notes. **Sync now** on the connection card runs a check at once and also finds calendars you added to the account. Changes made in OpenTodo on a device that is offline travel once the device syncs.

Each check reads the calendar first and writes to it second. When the same task was changed on both sides since the last check, **the newer change wins**: the event's last-modified time against the task's last change. A task that wins is written over the event; an event that wins changes the task. Changes of the task made on a device that syncs later still win over the calendar's by their own time, and the next check writes them to the calendar.

Changes made from the calendar appear in a task's history as "calendar sync".

## The connection card

Each connection shows its state first: **Choose a calendar**, **Waiting** for the first check, **Up to date** with the time of the last check, **Failed** with the reason and the last success, **Reconnect** when the server refused the password or Google's access was removed, or **Stopped** when the calendar tasks are written into no longer exists. Below: the account, where tasks go, how many calendars are shown, and what the last check did.

A failed check is retried after 5 minutes, then after twice as long each time, up to 6 hours. **Reconnect** takes a new app password, or signs in with Google again.

Deleting a connection removes its password or Google access from the server and stops all syncing. Your tasks stay as they are, and the events already written stay in the calendar as ordinary events; delete them there if you no longer want them. Choosing another calendar to write into leaves the events in the previous one in the same way.

## End-to-end encryption

The server cannot read an encrypted account's titles and notes. With encryption on, events are titled "Encrypted item" and carry no description, and a title changed in the calendar is not applied to the task. Dates, times and lengths still sync both ways.

## Limits

- Up to 3 calendar accounts per person; one calendar to write into and up to 10 shown per account.
- Up to 200 events written or removed per check; the rest follows about 20 seconds later.
- Repeating tasks are written as their next occurrence, not as a series. Alarms, attendees and invitations are not written.
- Moving an event of a task you may only view in a shared project is undone: the next check writes the task's time back (for a multi-day task, its start and due dates).
- Calendar sync is refused on a public demo instance.

## Outlook

Outlook.com and Microsoft 365 calendars do not offer CalDAV, so they cannot be connected yet; a separate Microsoft Graph connection is planned. Until then, subscribe to your [task feed](calendar-feeds.md) in Outlook (**Add calendar → Subscribe from web**) to see your tasks there, and add your Outlook calendar's published address as an [other calendar](other-calendars.md) to see its events in Day and Week. Both are read-only.

## What the server contacts

Only the calendar servers people typed, under the same private-network rule as webhooks (a server on your own network needs **Allow private network targets** in **Settings → Integrations → Webhooks**), and Google's sign-in and CalDAV addresses when a Google client is set up and someone connects Google. Nothing is contacted while the owner switch is off. See also [Calendar apps (CalDAV)](caldav.md) for the other direction: OpenTodo as a CalDAV server for to-do apps.
