# Design

## D1. A property of the app password

`app_passwords.show_as TEXT NOT NULL DEFAULT 'todos' CHECK (show_as IN ('todos','events'))`, chosen at creation and shown in the list. One password, one mode: a client account is either a reminders account or a calendar account, which is how Apple Calendar, DAVx⁵ and Thunderbird set up CalDAV accounts. To change it, create another password.

## D2. Serving

In event mode the collections answer `supported-calendar-component-set` with `VEVENT`, and every report and GET serves `calfeed.WriteEvent` (the object Calendar sync writes, without `X-OPENTODO-TASK`'s connection marker) under the task's resource name. Only open tasks with a due date are members; ETags and the sync token follow the event's own content (title, notes, times, link), so a change of anything else does not make clients refetch. The CTag and `sync-collection` are per mode, so one account in each mode never sees the other's tokens.

## D3. Writes back

A PUT of a VEVENT onto an existing resource in event mode compares it with what was served, as Calendar sync's pull does (`calsync.EventSnapshot`, `calsync.EventOps`): times and title change the task, through `ApplyStrict` with device `caldav:<app-password-id>`. Other properties (alarms, attendees, location) are kept as client data as today. A DELETE unschedules the task (`calsync.UnscheduleOps`). A PUT of a new VEVENT creates a task as "Events become tasks" already does. `If-Match` is required as today.

## D4. What it costs

No new dependency; the mapping is calsync's. A list of a calendar is bounded as today (`caldav-sync` "CalDAV lookups do not scan the account").
