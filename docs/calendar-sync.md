---
title: Calendar sync
summary: Two-way sync with your own calendar: dated tasks become events in iCloud, Fastmail, Nextcloud, Google, Outlook, Microsoft 365 or any CalDAV calendar, and moving an event moves the task.
audience: user
section: Integrations
specs: [calendar-sync, calendar-feeds, end-to-end-encryption]
screens: [settings/calendar-sync]
order: 33
---
# Calendar sync

Connect the calendar account you already use and OpenTodo writes your dated tasks into one of its calendars as ordinary events. Move an event to another time there, make it longer, rename it or delete it, and the task follows. Change the task in OpenTodo and the event follows. Other calendars of the same account can be shown next to your tasks in the calendar views.

It works with every calendar service that speaks CalDAV with an app password (iCloud, Fastmail, Nextcloud, Synology Calendar, Radicale, Baïkal, mailbox.org and others) with Google Calendar, and with Outlook.com and Microsoft 365 (work or school) calendars: see [Connect Microsoft Outlook](#connect-microsoft-outlook).

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

Only events OpenTodo wrote change tasks. Your other events are never changed and never become tasks; the ones in the calendar tasks are written into are shown next to your tasks in the calendar views, read-only.

Tasks are written from 30 days back to a year ahead, the same tasks as the [task feed](calendar-feeds.md): your own and those of projects shared with you, outside archived projects. A zoned task (due 09:00 Europe/Berlin) keeps its zone; a floating task keeps its wall-clock time in your calendar's zone (for Outlook, your mailbox's time zone).

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

## Connect Microsoft Outlook

Outlook.com, Hotmail and Live accounts and Microsoft 365 work or school accounts connect through Microsoft Graph. With a Microsoft client set up by the server owner, choose **Connect Microsoft**. Microsoft asks you to pick an account and to allow OpenTodo to read your profile, read and write your calendars and read your mailbox settings (for your time zone), then sends you back to the panel to choose the calendars.

- **A work or school account** may need your organisation's approval first. The panel then says that your organisation's administrator must approve OpenTodo: ask your IT department to grant admin consent to the app, then connect again.
- **Times** follow your Outlook time zone (**Settings → General → Language and time** in Outlook on the web). Floating tasks and all-day tasks are written in it. When Microsoft does not say which zone your mailbox uses, times are written in UTC and the card says so.
- **Your own events** are never changed: OpenTodo marks the events it writes with a hidden property, and only those follow tasks.
- **Removing the access**: at account.microsoft.com → **Privacy → Apps and services** (personal accounts) or myaccount.microsoft.com → **Apps** (work or school). The connection then asks you to **Reconnect**.

### Set up the Microsoft client (server owner)

Microsoft only lets a server use Microsoft Graph with an app registration that belongs to whoever runs the server, so each server owner creates their own, once. A Microsoft account (a free personal one works) is enough.

1. Sign in at entra.microsoft.com (or portal.azure.com → **Microsoft Entra ID**) and open **App registrations → New registration**.
2. Name it (for example "OpenTodo") and choose who can connect:
   - **Accounts in any organizational directory and personal Microsoft accounts**, for everyone: keep the tenant `common`.
   - **Personal Microsoft accounts only**: set the tenant to `consumers`.
   - **Accounts in any organizational directory**: set the tenant to `organizations`.
   - **Accounts in this organizational directory only**: set the tenant to your directory's tenant ID (a GUID) or its domain, such as `contoso.onmicrosoft.com`.
3. Under **Redirect URI**, choose the platform **Web** and enter the address shown in **Settings → Integrations → Calendar sync → Microsoft client**, which is `https://<your server>/api/v1/calendar-sync/microsoft/callback`. It must be the address people open OpenTodo at; set `OPENTODO_BASE_URL` when the server runs behind a proxy.
4. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**: add `offline_access`, `User.Read`, `Calendars.ReadWrite` and `MailboxSettings.Read`. In an organisation that does not let people consent to apps themselves, an administrator chooses **Grant admin consent**.
5. **Certificates & secrets → Client secrets → New client secret**. Note its **expiry date**: Microsoft ends a client secret after at most 24 months.
6. Copy the **Application (client) ID** from **Overview** and the secret's **Value** (not its ID) into **Microsoft client** in the panel, with the tenant from step 2. The secret is stored in `<data>/secrets/calendar-sync.json`, never in the database, and is never shown again.

When the secret expires or is deleted, Microsoft refuses it: every Microsoft connection stops, and the Microsoft client form says when Microsoft refused the secret. Create a new secret and save it in the form, and the connections resume within a minute.

Instead of the panel, you can set `OPENTODO_MICROSOFT_CLIENT_ID` and `OPENTODO_MICROSOFT_CLIENT_SECRET` (or `OPENTODO_MICROSOFT_CLIENT_SECRET_FILE`, a file that holds it), and `OPENTODO_MICROSOFT_TENANT`. All are optional; when the id and a secret are set, they replace the panel's values, which then cannot be changed there.

National clouds (Microsoft 365 GCC High, DoD, operated by 21Vianet), certificate credentials and Exchange servers on your own premises are not supported. Without a Microsoft client, you can still subscribe to your [task feed](calendar-feeds.md) in Outlook (**Add calendar → Subscribe from web**) and add your Outlook calendar's published address as an [other calendar](other-calendars.md); both are read-only.

## When changes travel

The server checks each connected calendar every 5 minutes, and about 20 seconds after you change a task's date, time, length, title or notes. **Sync now** on the connection card runs a check at once and also finds calendars you added to the account. Changes made in OpenTodo on a device that is offline travel once the device syncs.

Each check reads the calendar first and writes to it second. When the same task was changed on both sides since the last check, **the newer change wins**: the event's last-modified time against the task's last change. A task that wins is written over the event; an event that wins changes the task. Changes of the task made on a device that syncs later still win over the calendar's by their own time, and the next check writes them to the calendar.

Changes made from the calendar appear in a task's history as "calendar sync".

## The connection card

Each connection shows its state first: **Choose a calendar**, **Waiting** for the first check, **Up to date** with the time of the last check, **Failed** with the reason and the last success, **Reconnect** when the server refused the password or Google's or Microsoft's access was removed, or **Stopped** when the calendar tasks are written into no longer exists or can no longer be written, or when Microsoft refused the server owner's client secret. Below: the account, where tasks go, how many calendars are shown, and what the last check did.

A failed check is retried after 5 minutes, then after twice as long each time, up to 6 hours. When the calendar asks to wait (Microsoft's throttling), the next check waits at least as long as it asks. **Reconnect** takes a new app password, or signs in with Google or Microsoft again.

Deleting a connection removes its password or Google or Microsoft access from the server and stops all syncing. Your tasks stay as they are, and the events already written stay in the calendar as ordinary events; delete them there if you no longer want them. Choosing another calendar to write into leaves the events in the previous one in the same way.

## End-to-end encryption

The server cannot read an encrypted account's titles and notes. With encryption on, events are titled "Encrypted item" and carry no description, and a title changed in the calendar is not applied to the task. Dates, times and lengths still sync both ways.

## Limits

- Up to 3 calendar accounts per person; one calendar to write into and up to 10 shown per account.
- Up to 200 events written or removed per check; the rest follows about 20 seconds later.
- Repeating tasks are written as their next occurrence, not as a series. Alarms, attendees and invitations are not written.
- Moving an event of a task you may only view in a shared project is undone: the next check writes the task's time back (for a multi-day task, its start and due dates).
- Calendar sync is refused on a public demo instance.

## What the server contacts

Only the calendar servers people typed, under the same private-network rule as webhooks (a server on your own network needs **Allow private network targets** in **Settings → Integrations → Webhooks**), Google's sign-in and CalDAV addresses when a Google client is set up and someone connects Google, and Microsoft's sign-in (`login.microsoftonline.com`) and Microsoft Graph (`graph.microsoft.com`) when a Microsoft client is set up and someone connects Microsoft. Requests to Microsoft never follow redirects. Nothing is contacted while the owner switch is off. See also [Calendar apps (CalDAV)](caldav.md) for the other direction: OpenTodo as a CalDAV server for to-do apps.
